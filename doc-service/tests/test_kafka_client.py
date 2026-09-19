import kafka_client

HOUR = 3600 * 1000


def test_fresh_message_is_not_stale():
    assert not kafka_client.is_stale(timestamp_ms=1_000_000 * HOUR - HOUR, now_ms=1_000_000 * HOUR)


def test_old_message_is_stale():
    assert kafka_client.is_stale(timestamp_ms=1_000_000 * HOUR - 25 * HOUR, now_ms=1_000_000 * HOUR)


def test_missing_timestamp_is_never_treated_as_stale():
    """Kafka reports 0/-1 when there's no timestamp; dropping those would lose real requests."""
    assert not kafka_client.is_stale(timestamp_ms=0, now_ms=1_000_000 * HOUR)
    assert not kafka_client.is_stale(timestamp_ms=-1, now_ms=1_000_000 * HOUR)
