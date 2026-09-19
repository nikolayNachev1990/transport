import threading
import time

from dispatcher import Dispatcher, FairQueue, Job, OffsetTracker


def job(offset, company="A", partition=0):
    return Job("t", partition, offset, {"extraction_id": f"e{offset}", "company_id": company}, company)


def test_offsets_commit_only_the_contiguous_finished_prefix():
    tracker = OffsetTracker()
    for offset in (5, 6, 7, 8):
        tracker.register(("t", 0), offset)
    assert tracker.complete(("t", 0), 7) is None, "6 and 5 are still running: nothing may be committed"
    assert tracker.complete(("t", 0), 5) == 6
    assert tracker.complete(("t", 0), 6) == 8, "6 finishing releases 7 as well"
    assert tracker.complete(("t", 0), 8) == 9


def test_partitions_are_tracked_independently():
    tracker = OffsetTracker()
    tracker.register(("t", 0), 0)
    tracker.register(("t", 1), 10)
    assert tracker.complete(("t", 1), 10) == 11
    assert tracker.complete(("t", 0), 0) == 1


def test_a_small_company_overtakes_a_big_backlog():
    queue = FairQueue(per_company_cap=2)
    for i in range(6):
        queue.put(job(i, "big"))
    queue.put(job(100, "small"))
    first_three = [queue.get(0.01), queue.get(0.01), queue.get(0.01)]
    assert "small" in [j.company for j in first_three if j], "round-robin: the small company is served within the first turns"


def test_per_company_cap_is_respected():
    queue = FairQueue(per_company_cap=2)
    for i in range(5):
        queue.put(job(i, "big"))
    taken = [queue.get(0.01) for _ in range(4)]
    assert sum(1 for j in taken if j) == 2, "a third job of the same company must wait"
    queue.done(next(j for j in taken if j))
    assert queue.get(0.01) is not None


def _dispatcher(handler, on_fatal=None, **kwargs):
    d = Dispatcher(handler, on_fatal or (lambda j, e: None), **kwargs)
    d.start()
    return d


def _wait_for(d, count, timeout=5):
    finished = []
    deadline = time.monotonic() + timeout
    while len(finished) < count and time.monotonic() < deadline:
        finished.extend(d.drain_completions())
        time.sleep(0.02)
    return finished


def test_workers_run_jobs_in_parallel():
    d = _dispatcher(lambda topic, body: time.sleep(0.3), workers=3, per_company_cap=3)
    started = time.monotonic()
    for i in range(6):
        d.submit(job(i))
    assert len(_wait_for(d, 6)) == 6
    elapsed = time.monotonic() - started
    assert elapsed < 1.0, f"6 x 0.3 s on 3 workers should take ~0.6 s, took {elapsed:.2f}"
    d.stop(1)


def test_one_company_is_capped_even_with_free_workers():
    running, peak, lock = 0, 0, threading.Lock()

    def handler(topic, body):
        nonlocal running, peak
        with lock:
            running += 1
            peak = max(peak, running)
        time.sleep(0.15)
        with lock:
            running -= 1

    d = _dispatcher(handler, workers=4, per_company_cap=1)
    for i in range(4):
        d.submit(job(i, "only"))
    _wait_for(d, 4)
    assert peak == 1
    d.stop(1)


def test_a_failing_job_is_reported_and_does_not_block_the_partition():
    failures = []

    def handler(topic, body):
        if body["extraction_id"] == "e1":
            raise RuntimeError("bug")

    d = _dispatcher(handler, on_fatal=lambda j, e: failures.append((j.body["extraction_id"], str(e))), workers=2, retries=1)
    for i in range(3):
        d.submit(job(i))
    finished = _wait_for(d, 3)
    assert sorted(j.offset for j in finished) == [0, 1, 2], "the failed job still counts as finished so its offset can commit"
    assert failures == [("e1", "bug")]
    d.stop(1)


def test_retry_recovers_a_transient_error():
    attempts = []

    def handler(topic, body):
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError("transient")

    failures = []
    d = _dispatcher(handler, on_fatal=lambda j, e: failures.append(j), workers=1, retries=1)
    d.submit(job(0))
    _wait_for(d, 1)
    assert len(attempts) == 2 and failures == []
    d.stop(1)


def test_buffer_full_signals_backpressure():
    gate = threading.Event()
    d = _dispatcher(lambda t, b: gate.wait(2), workers=1, max_buffer=3)
    for i in range(3):
        d.submit(job(i))
    time.sleep(0.1)
    assert d.full()
    gate.set()
    _wait_for(d, 3)
    assert not d.full()
    d.stop(1)


def test_revoked_partitions_hand_buffered_jobs_back():
    queue = FairQueue(per_company_cap=1)
    queue.put(job(0, "A", partition=0))
    queue.put(job(1, "A", partition=1))
    dropped = queue.discard({("t", 1)})
    assert [j.partition for j in dropped] == [1]
    assert queue.pending() == 1
