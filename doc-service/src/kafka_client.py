"""Thin wrapper around confluent-kafka — matches the envelope
`@transport/core/broker` uses on the Node side (`{header: {}, body: {...}}`,
JSON, random message key) so the two sides stay wire-compatible without
doc-service depending on that Node package at all.
"""
import json
import uuid
from typing import Callable

from confluent_kafka import Consumer, Producer

import config

_producer: Producer | None = None


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
    behavior on an uncaught consumer error)."""
    consumer = Consumer(
        {
            "bootstrap.servers": ",".join(config.KAFKA_BROKERS),
            "group.id": config.KAFKA_GROUP_ID,
            "auto.offset.reset": "latest",
            "enable.auto.commit": False,
        }
    )
    consumer.subscribe(topics)
    try:
        while True:
            message = consumer.poll(1.0)
            if message is None:
                continue
            if message.error():
                print(f"kafka: consumer error: {message.error()}")
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
