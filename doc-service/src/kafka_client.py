"""Thin wrapper around confluent-kafka — matches the envelope
`@transport/core/broker` uses on the Node side (`{header: {}, body: {...}}`,
JSON, random message key) so the two sides stay wire-compatible without
doc-service depending on that Node package at all.
"""
import json
import signal
import threading
import time
import uuid
from typing import Callable

from confluent_kafka import Consumer, Producer, TopicPartition

import config
from dispatcher import Dispatcher, Job, OffsetTracker

_producer: Producer | None = None
_producer_lock = threading.Lock()

# A request older than this is stale: the user gave up long ago, and paying
# for an AI read of it would be waste.
MAX_MESSAGE_AGE_SECONDS = 24 * 3600


def is_stale(timestamp_ms: int, now_ms: int, max_age_seconds: int = MAX_MESSAGE_AGE_SECONDS) -> bool:
    return timestamp_ms > 0 and (now_ms - timestamp_ms) > max_age_seconds * 1000


def get_producer() -> Producer:
    global _producer
    with _producer_lock:  # several workers publish at once
        if _producer is None:
            _producer = Producer({"bootstrap.servers": ",".join(config.KAFKA_BROKERS)})
    return _producer


def send(topic: str, body: dict) -> None:
    envelope = {"header": {}, "body": body}
    producer = get_producer()
    producer.produce(topic, key=str(uuid.uuid4()), value=json.dumps(envelope))
    producer.flush()


def consume_forever(topics: list[str], handler: Callable[[str, dict], None], on_fatal: Callable[[Job, Exception], None]) -> None:
    """Poll loop + work queue (see dispatcher.py).

    The loop only polls, buffers and commits; handlers run in the dispatcher's
    workers. An offset is committed once every earlier offset of its partition
    has finished — a crash redelivers anything unfinished (at-least-once;
    fleet-service ignores a result for a request that is no longer queued).

    auto.offset.reset is "earliest", not "latest": with "latest", a partition
    the group has never committed on starts at its END, so any request sent
    while the service was restarting or rebalancing (a deploy) was skipped
    forever and its extraction sat "queued". Stale messages are filtered by
    age instead. SIGTERM finishes running jobs and leaves the group cleanly so
    a restart doesn't wait out the session timeout."""
    consumer = Consumer(
        {
            "bootstrap.servers": ",".join(config.KAFKA_BROKERS),
            "group.id": config.KAFKA_GROUP_ID,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        }
    )
    dispatcher = Dispatcher(handler, on_fatal, workers=config.WORKERS, per_company_cap=config.PER_COMPANY_MAX, max_buffer=config.MAX_BUFFER)
    tracker = OffsetTracker()
    state = {"running": True, "paused": False}

    def _stop(*_):
        state["running"] = False

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    def commit_finished() -> None:
        highest: dict[tuple[str, int], int] = {}
        for job in dispatcher.drain_completions():
            next_offset = tracker.complete(job.tp, job.offset)
            if next_offset is not None:
                highest[job.tp] = max(highest.get(job.tp, 0), next_offset)
        if highest:
            consumer.commit(offsets=[TopicPartition(t, p, o) for (t, p), o in highest.items()], asynchronous=False)

    def on_revoke(_consumer, partitions) -> None:
        owned = {(p.topic, p.partition) for p in partitions}
        dropped = dispatcher.queue.discard(owned)
        # running jobs finish; whatever was only buffered goes back to the new owner
        deadline = time.monotonic() + 20
        while dispatcher.queue.running() and time.monotonic() < deadline:
            time.sleep(0.2)
        try:
            commit_finished()
        except Exception as error:  # noqa: BLE001
            print(f"kafka: commit on revoke failed: {error}")
        for tp in owned:
            tracker.forget(tp)
        print(f"kafka: partitions revoked ({len(owned)}), {len(dropped)} buffered jobs handed back")

    def on_assign(_consumer, _partitions) -> None:
        state["paused"] = False

    dispatcher.start()
    consumer.subscribe(topics, on_assign=on_assign, on_revoke=on_revoke)
    last_stats = time.monotonic()
    try:
        while state["running"]:
            commit_finished()

            # Backpressure: stop pulling from Kafka while the buffer is full,
            # but keep polling so the group doesn't think we died.
            if dispatcher.full() and not state["paused"]:
                consumer.pause(consumer.assignment())
                state["paused"] = True
            elif not dispatcher.full() and state["paused"]:
                consumer.resume(consumer.assignment())
                state["paused"] = False

            if time.monotonic() - last_stats > 60:
                print(f"dispatcher: pending={dispatcher.queue.pending()} running={dispatcher.queue.running()} paused={state['paused']}")
                last_stats = time.monotonic()

            message = consumer.poll(0.5)
            if message is None:
                continue
            if message.error():
                print(f"kafka: consumer error: {message.error()}")
                continue

            tp = (message.topic(), message.partition())
            tracker.register(tp, message.offset())

            if is_stale(message.timestamp()[1], int(time.time() * 1000)):
                print(f"kafka: skipping stale '{message.topic()}' message (older than {MAX_MESSAGE_AGE_SECONDS // 3600} h)")
                dispatcher.completions.append(Job(message.topic(), message.partition(), message.offset(), {}))
                continue

            try:
                body = json.loads(message.value().decode("utf-8")).get("body", {})
            except (ValueError, AttributeError):
                print(f"kafka: unreadable message at {tp}@{message.offset()}, skipping")
                dispatcher.completions.append(Job(message.topic(), message.partition(), message.offset(), {}))
                continue
            dispatcher.submit(Job(message.topic(), message.partition(), message.offset(), body, str(body.get("company_id") or "unknown")))
    finally:
        dispatcher.stop(30)
        try:
            commit_finished()
        except Exception as error:  # noqa: BLE001
            print(f"kafka: final commit failed: {error}")
        consumer.close()
