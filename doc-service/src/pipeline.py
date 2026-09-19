"""Orchestrates one fleet.extraction.requested -> doc.extraction.completed
or doc.extraction.failed (+ doc.ai_usage.recorded on a real AI call).
Level 1 (local parsers, no AI) runs first; only when it can't return every
required field with enough confidence does the request go to the AI tier
(SPEC-doc-service.md §3-§5).
"""
import datetime

import jsonschema

import ai_client
import kafka_client
import level1
import s3_client
import schemas

# Rough $/million-token rates — informational only (doc.ai_usage.recorded
# is a reporting signal, not a billing source of truth). Verify against
# https://www.anthropic.com/pricing before relying on this for anything
# that touches real invoicing.
MODEL_PRICING_PER_MTOK = {
    "claude-opus-5": {"input": 15.0, "output": 75.0},
    "claude-sonnet-5": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5-20251001": {"input": 1.0, "output": 5.0},
}
# Falls back to Haiku-tier pricing, not Sonnet/Opus — the default model
# (ANTHROPIC_MODEL) is Haiku, so an unrecognized model string is far more
# likely to be a newer/renamed Haiku than a pricier tier.
DEFAULT_PRICING = MODEL_PRICING_PER_MTOK["claude-haiku-4-5-20251001"]


def _estimate_cost_usd(model: str, input_tokens: int, output_tokens: int, cache_read: int = 0, cache_write: int = 0) -> float:
    """Cache reads bill at 0.1x the input rate, cache writes at 1.25x."""
    pricing = MODEL_PRICING_PER_MTOK.get(model, DEFAULT_PRICING)
    input_cost = input_tokens * pricing["input"] + cache_read * pricing["input"] * 0.1 + cache_write * pricing["input"] * 1.25
    return round((input_cost + output_tokens * pricing["output"]) / 1_000_000, 6)


def _publish_failed(extraction_id: str, error_code: str) -> None:
    body = {"extraction_id": extraction_id, "error_code": error_code}
    jsonschema.validate(body, schemas.DOC_EXTRACTION_FAILED_BODY)
    kafka_client.send("doc.extraction.failed", body)


def _normalize_completed(extraction_id: str, tool_input: dict) -> dict:
    fields = tool_input.get("fields") or {}
    return {
        "extraction_id": extraction_id,
        "engine": "ai",
        "detected_type_code": tool_input.get("detected_type_code"),
        "detected_subject": tool_input.get("detected_subject") or None,
        "fields": fields,
        "confidence": tool_input.get("confidence") or None,
        "readability_score": tool_input.get("readability_score"),
    }


def _try_level1(file_bytes: bytes, mime_type: str | None, allowed_codes: set[str]):
    """A Level-1 crash must never lose the request — log it and let the AI
    tier have a go."""
    try:
        return level1.extract(file_bytes, mime_type, allowed_codes)
    except Exception as error:  # noqa: BLE001
        print(f"pipeline: level1 failed, falling back to AI: {error}")
        return None


def handle_extraction_requested(body: dict) -> None:
    try:
        jsonschema.validate(body, schemas.FLEET_EXTRACTION_REQUESTED_BODY)
    except jsonschema.ValidationError as error:
        print(f"pipeline: fleet.extraction.requested failed local validation: {error.message}")
        return

    extraction_id = body["extraction_id"]
    company_id = body["company_id"]
    file_key = body["file_key"]
    mime_type = body["mime_type"]
    allowed_types = body["allowed_types"]
    hints = body["hints"]

    try:
        file_bytes = s3_client.get_object_bytes(file_key)
    except Exception as error:  # noqa: BLE001
        print(f"pipeline: could not fetch '{file_key}' from S3: {error}")
        _publish_failed(extraction_id, "DOC_FILE_NOT_FOUND")
        return

    local = _try_level1(file_bytes, mime_type, {t["code"] for t in allowed_types})
    if local:
        completed_body = {
            "extraction_id": extraction_id,
            "engine": "local",
            "detected_type_code": local.type_code,
            "detected_subject": local.subject or None,
            "fields": local.fields,
            "confidence": local.confidence,
            "readability_score": local.readability,
        }
        jsonschema.validate(completed_body, schemas.DOC_EXTRACTION_COMPLETED_BODY)
        kafka_client.send("doc.extraction.completed", completed_body)
        return

    try:
        result = ai_client.extract(file_bytes, mime_type, allowed_types, hints)
    except ai_client.UnsupportedMimeTypeError:
        _publish_failed(extraction_id, "DOC_UNSUPPORTED_MIME")
        return
    except ai_client.AIInvalidResponseError as error:
        print(f"pipeline: AI returned an invalid response for {extraction_id}: {error}")
        _publish_failed(extraction_id, "DOC_AI_INVALID_RESPONSE")
        return
    except ai_client.AIUnavailableError as error:
        print(f"pipeline: AI unavailable for {extraction_id}: {error}")
        _publish_failed(extraction_id, "DOC_AI_UNAVAILABLE")
        return

    completed_body = _normalize_completed(extraction_id, result["tool_input"])
    try:
        jsonschema.validate(completed_body, schemas.DOC_EXTRACTION_COMPLETED_BODY)
    except jsonschema.ValidationError as error:
        # Our own normalization produced something that doesn't match the
        # contract — a doc-service bug, not a bad AI response. Fail loudly
        # rather than publish something fleet-service will also reject.
        print(f"pipeline: normalized result failed local validation for {extraction_id}: {error.message}")
        _publish_failed(extraction_id, "DOC_AI_INVALID_RESPONSE")
        return

    kafka_client.send("doc.extraction.completed", completed_body)

    usage_body = {
        "extraction_id": extraction_id,
        "company_id": company_id,
        "model": ai_client.config.ANTHROPIC_MODEL,
        "input_tokens": result["input_tokens"] + result["cache_read_tokens"] + result["cache_write_tokens"],
        "output_tokens": result["output_tokens"],
        "estimated_cost_usd": _estimate_cost_usd(
            ai_client.config.ANTHROPIC_MODEL, result["input_tokens"], result["output_tokens"], result["cache_read_tokens"], result["cache_write_tokens"]
        ),
        "occurred_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    jsonschema.validate(usage_body, schemas.DOC_AI_USAGE_RECORDED_BODY)
    kafka_client.send("doc.ai_usage.recorded", usage_body)
