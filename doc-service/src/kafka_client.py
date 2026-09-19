"""Thin wrapper around confluent-kafka — matches the envelope
`@transport/core/broker` uses on the Node side (`{header: {}, body: {...}}`,
JSON, random message key) so the two sides stay wire-compatible without
doc-service depending on that Node package at all.
"""
import json
import signal
import time
import uuid
from typing import Callable

from confluent_kafka import Consumer, Producer

import config

_producer: Producer | None = None

# A request older than this is stale: the user gave up long ago, and paying
# for an AI read of it would be waste.
MAX_MESSAGE_AGE_SECONDS = 24 * 3600


def is_stale(timestamp_ms: int, now_ms: int, max_age_seconds: int = MAX_MESSAGE_AGE_SECONDS) -> bool:
    return timestamp_ms > 0 and (now_ms - timestamp_ms) > max_age_seconds * 1000


def get_producer() -> Producer:
    global _producer
    if _producer is None:
        _producer = Producer({"bootstrap.servers": ",".join(config.KAFKA_BROKERS)})
    return _producer


def send(topic: str, body: dict) -> None:
    envelope = {"header": {}, "body": body}
    producer = get_producer()
    producer.produce(topic, key=str(uuid.uuid4()), value=json.dumps(envelope))
    producer.flush()


def consume_forever(topics: list[str], handler: Callable[[str, dict], None]) -> None:
    """Blocking. Commits the offset only after `handler` returns without
    raising — a raised exception leaves the message uncommitted, so a
    restart redelivers it (at-least-once, matching the Node broker's own
    behavior on an uncaught consumer error).

    auto.offset.reset is "earliest", not "latest": with "latest", a partition
    the group has never committed on starts at its END, so any request sent
    while the service was restarting or rebalancing (a deploy) was skipped
    forever and its extraction sat "queued". Stale messages are filtered by
    age instead. SIGTERM leaves the group cleanly so a restart doesn't wait
    out the session timeout for the old member's partitions."""
    consumer = Consumer(
        {
            "bootstrap.servers": ",".join(config.KAFKA_BROKERS),
            "group.id": config.KAFKA_GROUP_ID,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        }
    )
    running = True

    def _stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    consumer.subscribe(topics)
    try:
        while running:
            message = consumer.poll(1.0)
            if message is None:
                continue
            if message.error():
                print(f"kafka: consumer error: {message.error()}")
                continue

            if is_stale(message.timestamp()[1], int(time.time() * 1000)):
                print(f"kafka: skipping stale '{message.topic()}' message (older than {MAX_MESSAGE_AGE_SECONDS // 3600} h)")
                consumer.commit(message=message, asynchronous=False)
                continue

            envelope = json.loads(message.value().decode("utf-8"))
            body = envelope.get("body", {})
            try:
                handler(message.topic(), body)
            except Exception as error:  # noqa: BLE001 — logged, message stays uncommitted for redelivery
                print(f"kafka: handler error for '{message.topic()}': {error}")
                continue

            consumer.commit(message=message, asynchronous=False)
    finally:
        consumer.close()
