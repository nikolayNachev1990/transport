"""Orchestrates one fleet.extraction.requested -> doc.extraction.completed
or doc.extraction.failed (+ doc.ai_usage.recorded on a real AI call).
Level 1 (local parsers, no AI) runs first; only when it can't return every
required field with enough confidence does the request go to the AI tier
(SPEC-doc-service.md §3-§5).
"""
import datetime

import jsonschema

import ai_client
import ai_prep
import kafka_client
import hybrid
import level1
import quality
import s3_client
import schemas
import validators

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


def _analyze_level1(file_bytes: bytes, mime_type: str | None, allowed_codes: set[str], image_quality: float = 1.0) -> level1.Analysis:
    """A Level-1 crash must never lose the request — log it and let the AI
    tier have a go. A low-quality photo skips Level 1 entirely: OCR that
    misreads consistently still produces confident votes, and its reading
    would only mislead the AI as a hint."""
    if image_quality < quality.UNREADABLE:
        return level1.Analysis()
    try:
        return level1.analyze(file_bytes, mime_type, allowed_codes, image_quality)
    except Exception as error:  # noqa: BLE001
        print(f"pipeline: level1 failed, falling back to AI: {error}")
        return level1.Analysis()


REQUIRED_TYPE_CONFIDENCE = 0.7
IDENTITY_FIELDS = ("document_number", "vin", "registration_number", "valid_to", "driver_name")
UNSURE_BELOW = 0.6


def escalation_reasons(tool_input: dict, partial, type_by_code: dict, image_quality: float) -> list[str]:
    """Why a first answer deserves the stronger model. None of these are
    'the model seems unsure' — each is checkable: a value that cannot be valid,
    two readers that disagree, a field the type requires and nobody found, or
    no type at all. A blurry photo is never escalated: a stronger model does
    not make it legible."""
    if image_quality < quality.UNREADABLE:
        return []
    reasons: list[str] = []
    fields = tool_input.get("fields") or {}
    subject = tool_input.get("detected_subject") or {}
    confidence = tool_input.get("confidence") or {}

    if bad := validators.invalid_fields(fields, subject):
        reasons.append("invalid:" + ",".join(bad))
    # The model's own doubt about an identity field is a reason too — a VIN
    # it reports at 0.4 is a VIN worth a second look.
    unsure = sorted(n for n in IDENTITY_FIELDS if n in confidence and confidence[n] < UNSURE_BELOW and (fields.get(n) or subject.get(n)))
    if unsure:
        reasons.append("low-confidence:" + ",".join(unsure))
    if partial:
        local_names = {name.split(".", 1)[-1] for name in hybrid._flatten(partial.fields, partial.subject)}
        disagreeing = sorted(n for n in local_names if confidence.get(n, 1.0) <= hybrid.DISAGREE_CAP)
        if disagreeing:
            reasons.append("disagree:" + ",".join(disagreeing))

    type_code = tool_input.get("detected_type_code")
    if not type_code or confidence.get("detected_type_code", 1.0) < REQUIRED_TYPE_CONFIDENCE:
        reasons.append("type-unsure")
    elif type_code in type_by_code:
        spec = type_by_code[type_code]
        if spec["requires_number"] and not fields.get("document_number"):
            reasons.append("missing:document_number")
        if spec["has_expiry"] and not spec["expiry_by_km"] and not fields.get("valid_to"):
            reasons.append("missing:valid_to")
    return reasons


def _ask_ai(ai_bytes, ai_mime, allowed_types, hints, partial, type_by_code, image_quality):
    """First answer from the standard model; if it fails a check, one second
    opinion from the stronger model, which is the answer that is published.
    Returns (tool_input, [call results]) — every call is billed and reported."""
    local_hint = hybrid.hint_for_prompt(partial) if partial else None
    first = ai_client.extract(ai_bytes, ai_mime, allowed_types, hints, local_hint)
    first_input = hybrid.merge(first["tool_input"], partial) if partial else first["tool_input"]

    stronger = ai_client.config.ANTHROPIC_MODEL_ESCALATION
    reasons = escalation_reasons(first_input, partial, type_by_code, image_quality)
    if not reasons or not stronger or stronger == first["model"]:
        return first_input, [first]

    print(f"pipeline: escalating to {stronger} ({'; '.join(reasons)})")
    try:
        second = ai_client.extract(ai_bytes, ai_mime, allowed_types, hints, local_hint, model=stronger)
    except (ai_client.AIUnavailableError, ai_client.AIInvalidResponseError) as error:
        # the first answer is still a valid answer; keep it, flagged
        print(f"pipeline: escalation failed ({error}); keeping the first answer")
        return first_input, [first]
    second_input = hybrid.merge(second["tool_input"], partial) if partial else second["tool_input"]
    return _agreement_boost(second_input, first_input), [first, second]


def _agreement_boost(final: dict, earlier: dict) -> dict:
    """A value both AI passes produced independently is more trustworthy than
    one pass's own self-report."""
    f_flat = hybrid._flatten(final.get("fields") or {}, final.get("detected_subject") or {})
    e_flat = hybrid._flatten(earlier.get("fields") or {}, earlier.get("detected_subject") or {})
    confidence = dict(final.get("confidence") or {})
    for name, value in f_flat.items():
        short = name.split(".", 1)[-1]
        if name in e_flat and hybrid._same(value, e_flat[name]) and confidence.get(short, 0) > hybrid.DISAGREE_CAP:
            confidence[short] = max(confidence.get(short, 0), 0.9)
    return {**final, "confidence": confidence}


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

    image_quality = quality.score_bytes(file_bytes)
    analysis = _analyze_level1(file_bytes, mime_type, {t["code"] for t in allowed_types}, image_quality)
    local = analysis.result
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

    ai_bytes, ai_mime = ai_prep.prepare(file_bytes, mime_type)
    type_by_code = {t["code"]: t for t in allowed_types}
    try:
        tool_input, calls = _ask_ai(ai_bytes, ai_mime, allowed_types, hints, analysis.partial, type_by_code, image_quality)
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

    completed_body = _normalize_completed(extraction_id, tool_input)
    if analysis.partial:
        completed_body["engine"] = "hybrid"
    completed_body["confidence"], completed_body["readability_score"] = quality.cap(
        completed_body["confidence"], completed_body["readability_score"], image_quality
    )
    # A value that cannot be valid (an 18-character VIN) must not look usable:
    # a human retypes it, nothing pre-fills it with confidence.
    if completed_body["confidence"] is not None:
        for name in validators.invalid_fields(completed_body["fields"], completed_body["detected_subject"] or {}):
            completed_body["confidence"][name] = min(completed_body["confidence"].get(name, 0.2), 0.2)
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

    for call in calls:  # one usage event per real AI call, the escalation included
        usage_body = {
            "extraction_id": extraction_id,
            "company_id": company_id,
            "model": call["model"],
            "input_tokens": call["input_tokens"] + call["cache_read_tokens"] + call["cache_write_tokens"],
            "output_tokens": call["output_tokens"],
            "estimated_cost_usd": _estimate_cost_usd(
                call["model"], call["input_tokens"], call["output_tokens"], call["cache_read_tokens"], call["cache_write_tokens"]
            ),
            "occurred_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        jsonschema.validate(usage_body, schemas.DOC_AI_USAGE_RECORDED_BODY)
        kafka_client.send("doc.ai_usage.recorded", usage_body)


def report_fatal(job, error: Exception) -> None:
    """A request whose handler crashed twice: tell fleet-service instead of
    leaving the extraction 'queued' forever."""
    extraction_id = (job.body or {}).get("extraction_id")
    print(f"pipeline: giving up on {extraction_id}: {error}")
    if extraction_id:
        _publish_failed(extraction_id, "DOC_INTERNAL_ERROR")
