"""Work queue between the Kafka poll loop and the extraction handlers.

Kafka is the durable queue; this is the part that decides who runs next.
One message at a time (the old loop) meant a 100-document bulk import made
the last document wait for the other 99, and one company's import starved
everyone else. Here:

  - a pool of workers runs handlers in parallel (OCR shells out to
    tesseract and the AI call is network I/O, so threads are enough);
  - jobs wait in one FIFO per company and workers take them round-robin
    across companies, with at most `per_company_cap` of one company running
    at once — a small company's single upload overtakes a big company's
    backlog;
  - a bounded buffer: when it is full the poll loop pauses consumption
    instead of pulling the whole topic into memory;
  - offsets are committed only as a contiguous prefix of finished jobs per
    partition (OffsetTracker): finishing offset 7 before offset 5 must not
    make a crash lose 5;
  - a job that keeps failing is answered with a failure event and counted
    as finished, never left blocking its partition.
"""
import collections
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

TopicPartition = tuple[str, int]


@dataclass
class Job:
    topic: str
    partition: int
    offset: int
    body: dict
    company: str = "unknown"
    enqueued_at: float = field(default_factory=time.monotonic)

    @property
    def tp(self) -> TopicPartition:
        return (self.topic, self.partition)


class OffsetTracker:
    """Per partition: which offsets are finished, and how far the contiguous
    finished prefix reaches. `complete` returns the offset to commit (the next
    offset to read) when the prefix advanced, else None."""

    def __init__(self) -> None:
        self._next: dict[TopicPartition, int] = {}
        self._finished: dict[TopicPartition, set[int]] = collections.defaultdict(set)

    def register(self, tp: TopicPartition, offset: int) -> None:
        self._next.setdefault(tp, offset)

    def complete(self, tp: TopicPartition, offset: int) -> int | None:
        self._finished[tp].add(offset)
        start = self._next.get(tp, offset)
        cursor = start
        while cursor in self._finished[tp]:
            self._finished[tp].discard(cursor)
            cursor += 1
        if cursor == start:
            return None
        self._next[tp] = cursor
        return cursor

    def forget(self, tp: TopicPartition) -> None:
        self._next.pop(tp, None)
        self._finished.pop(tp, None)


class FairQueue:
    """FIFO per company, served round-robin, with a per-company running cap."""

    def __init__(self, per_company_cap: int) -> None:
        self._cap = per_company_cap
        self._queues: dict[str, collections.deque[Job]] = {}
        self._order: collections.deque[str] = collections.deque()
        self._running: collections.Counter = collections.Counter()
        self._condition = threading.Condition()
        self._closed = False

    def put(self, job: Job) -> None:
        with self._condition:
            if job.company not in self._queues:
                self._queues[job.company] = collections.deque()
                self._order.append(job.company)
            self._queues[job.company].append(job)
            self._condition.notify()

    def _take(self) -> Job | None:
        for _ in range(len(self._order)):
            company = self._order[0]
            self._order.rotate(-1)
            queue = self._queues.get(company)
            if queue and self._running[company] < self._cap:
                job = queue.popleft()
                self._running[company] += 1
                return job
        return None

    def get(self, timeout: float = 0.5) -> Job | None:
        with self._condition:
            job = self._take()
            if job is None and not self._closed:
                self._condition.wait(timeout)
                job = self._take()
            return job

    def done(self, job: Job) -> None:
        with self._condition:
            self._running[job.company] -= 1
            self._condition.notify()

    def discard(self, partitions: set[TopicPartition]) -> list[Job]:
        """Drop waiting jobs of partitions this consumer no longer owns."""
        dropped: list[Job] = []
        with self._condition:
            for company, queue in self._queues.items():
                kept = collections.deque(j for j in queue if j.tp not in partitions)
                dropped.extend(j for j in queue if j.tp in partitions)
                self._queues[company] = kept
        return dropped

    def pending(self) -> int:
        with self._condition:
            return sum(len(q) for q in self._queues.values())

    def running(self) -> int:
        with self._condition:
            return sum(self._running.values())

    def close(self) -> None:
        with self._condition:
            self._closed = True
            self._condition.notify_all()


class Dispatcher:
    def __init__(
        self,
        handler: Callable[[str, dict], None],
        on_fatal: Callable[[Job, Exception], None],
        workers: int = 2,
        per_company_cap: int = 2,
        max_buffer: int = 40,
        retries: int = 1,
    ) -> None:
        self._handler = handler
        self._on_fatal = on_fatal
        self._retries = retries
        self.queue = FairQueue(per_company_cap)
        self.max_buffer = max_buffer
        self.completions: collections.deque[Job] = collections.deque()
        self._threads = [threading.Thread(target=self._work, name=f"doc-worker-{i}", daemon=True) for i in range(workers)]
        self._stopping = False

    def start(self) -> None:
        for thread in self._threads:
            thread.start()

    def full(self) -> bool:
        return self.queue.pending() + self.queue.running() >= self.max_buffer

    def submit(self, job: Job) -> None:
        self.queue.put(job)

    def _work(self) -> None:
        while not self._stopping:
            job = self.queue.get()
            if job is None:
                continue
            started = time.monotonic()
            try:
                self._run(job)
            finally:
                self.queue.done(job)
                self.completions.append(job)
                print(f"dispatcher: {job.topic}[{job.partition}]@{job.offset} company={job.company} waited={started - job.enqueued_at:.1f}s ran={time.monotonic() - started:.1f}s")

    def _run(self, job: Job) -> None:
        last_error: Exception | None = None
        for attempt in range(self._retries + 1):
            try:
                self._handler(job.topic, job.body)
                return
            except Exception as error:  # noqa: BLE001
                last_error = error
                print(f"dispatcher: attempt {attempt + 1} failed for {job.body.get('extraction_id')}: {error}")
        # Out of retries: answer with a failure instead of blocking the
        # partition forever. The requester sees an error, not silence.
        try:
            self._on_fatal(job, last_error)  # type: ignore[arg-type]
        except Exception as error:  # noqa: BLE001
            print(f"dispatcher: could not report failure for {job.body.get('extraction_id')}: {error}")

    def drain_completions(self) -> list[Job]:
        finished = []
        while self.completions:
            finished.append(self.completions.popleft())
        return finished

    def stop(self, wait_seconds: float = 30.0) -> None:
        """Let running jobs finish (waiting jobs stay in Kafka: uncommitted)."""
        deadline = time.monotonic() + wait_seconds
        while self.queue.running() and time.monotonic() < deadline:
            time.sleep(0.2)
        self._stopping = True
        self.queue.close()
