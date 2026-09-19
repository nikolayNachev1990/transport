import config  # noqa: F401 — imported first so a missing env var fails fast, before anything else starts
import health
import kafka_client
from pipeline import handle_extraction_requested

TOPIC_HANDLERS = {
    "fleet.extraction.requested": handle_extraction_requested,
}


def _dispatch(topic: str, body: dict) -> None:
    handler = TOPIC_HANDLERS.get(topic)
    if not handler:
        print(f"main: no handler for topic '{topic}'")
        return
    handler(body)


def main() -> None:
    health.start_in_background()
    print(f"doc-service: consuming {list(TOPIC_HANDLERS.keys())}")
    kafka_client.consume_forever(list(TOPIC_HANDLERS.keys()), _dispatch)


if __name__ == "__main__":
    main()
