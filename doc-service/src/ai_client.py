"""Level-2 extraction (SPEC-doc-service.md §5) — the only tier that
exists yet (Etap 1: AI-only for everything, no local parsers built).
Structured output via forced tool-use, not free-text parsing — an
invalid/malformed response is a hard error (DOC_AI_INVALID_RESPONSE),
never guessed at.
"""
import base64
import json
import time

import anthropic

import config

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
DOCUMENT_MIME_TYPES = {"application/pdf"}

TOOL_NAME = "submit_extraction"


class AIUnavailableError(Exception):
    pass


class AIInvalidResponseError(Exception):
    pass


class UnsupportedMimeTypeError(Exception):
    pass


def _tool_schema(allowed_type_codes: list[str]) -> dict:
    return {
        "name": TOOL_NAME,
        "description": "Submit the recognized document type and every field you could extract from the image.",
        "input_schema": {
            "type": "object",
            "properties": {
                "detected_type_code": {
                    "type": ["string", "null"],
                    "enum": [*allowed_type_codes, None],
                    "description": "The code of the matching type, or null if none of the given types fit.",
                },
                "fields": {
                    "type": "object",
                    "description": "Core document fields plus a nested 'attributes' object matching the chosen type's attributes_schema.",
                    "properties": {
                        "document_number": {"type": ["string", "null"]},
                        "country": {"type": ["string", "null"]},
                        "valid_from": {"type": ["string", "null"], "description": "ISO date, if visible"},
                        "valid_to": {"type": ["string", "null"], "description": "ISO date, if visible"},
                        "attributes": {"type": "object"},
                    },
                },
                "detected_subject": {
                    "type": "object",
                    "description": "Best-effort identifiers for whatever vehicle/trailer/driver this document is about.",
                    "properties": {
                        "vin": {"type": ["string", "null"]},
                        "registration_number": {"type": ["string", "null"]},
                        "driver_name": {"type": ["string", "null"]},
                    },
                },
                "confidence": {"type": "object", "description": "0-1 confidence per extracted field, by field name."},
                "readability_score": {"type": "number", "description": "0-1 overall scan/photo quality score."},
            },
            "required": ["detected_type_code", "fields", "detected_subject", "confidence", "readability_score"],
        },
    }


def _compact_type(document_type: dict) -> dict:
    """Only what the model needs to pick a type and fill it: code, subject,
    which core fields the type carries, and the attribute properties. The
    business-rule columns (validity months, reminders, sensitivity, ...) are
    fleet-service's concern and cost tokens on every request."""
    schema = document_type["attributes_schema"]
    return {
        "code": document_type["code"],
        "subject": document_type["subject_type"],
        "has_expiry": document_type["has_expiry"],
        "has_number": document_type["requires_number"],
        "has_country": document_type["has_country"],
        "attributes": schema.get("properties", {}),
    }


def _types_block(allowed_types: list[dict]) -> str:
    """Everything that is the same for every request with the same subject
    filter — cached (SPEC-doc-service.md §5), so repeat requests pay ~10%
    for these ~10k tokens instead of full price."""
    return (
        "You read photos and scans of transport-company documents (vehicle registration, "
        "insurance, driving licence, permit, ...). Identify which of the following document "
        "types the file is, then extract every field you can read.\n\n"
        "Possible types, each with its own attributes_schema — fill 'fields.attributes' using "
        "ONLY property names from the chosen type's attributes_schema, nothing else:\n"
        f"{json.dumps([_compact_type(t) for t in allowed_types], separators=(',', ':'), ensure_ascii=False)}\n\n"
        "Use the submit_extraction tool to report. If a field isn't visible or you aren't "
        "confident, leave it null rather than guessing. Dates must be ISO 8601 (YYYY-MM-DD)."
    )


def _request_text(hints: dict, local_hint: dict | None = None) -> str:
    text = f"Caller-supplied hints (may be empty; a suggestion, not ground truth): {json.dumps(hints or {})}"
    if local_hint:
        text += (
            "\n\nA local OCR pass already read the following from this file. It is UNVERIFIED and may contain "
            "errors (a dropped digit, Z read as 2, O as 0). Check every value against the image itself and "
            f"report what you actually see, correcting the OCR where it is wrong: {json.dumps(local_hint, ensure_ascii=False)}"
        )
    return text


def _content_block(file_bytes: bytes, mime_type: str) -> dict:
    encoded = base64.b64encode(file_bytes).decode("ascii")
    if mime_type in IMAGE_MIME_TYPES:
        return {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": encoded}}
    if mime_type in DOCUMENT_MIME_TYPES:
        return {"type": "document", "source": {"type": "base64", "media_type": mime_type, "data": encoded}}
    raise UnsupportedMimeTypeError(mime_type)


def extract(file_bytes: bytes, mime_type: str, allowed_types: list[dict], hints: dict, local_hint: dict | None = None) -> dict:
    """Returns tool_input plus token counts, cache reads/writes reported separately (they are priced differently)."""
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY, timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
    allowed_type_codes = [t["code"] for t in allowed_types]
    content_block = _content_block(file_bytes, mime_type)
    system = [{"type": "text", "text": _types_block(allowed_types), "cache_control": {"type": "ephemeral"}}]

    last_error: Exception | None = None
    for attempt in range(config.AI_MAX_RETRIES + 1):
        try:
            response = client.messages.create(
                model=config.ANTHROPIC_MODEL,
                max_tokens=2048,
                system=system,
                tools=[_tool_schema(allowed_type_codes)],
                tool_choice={"type": "tool", "name": TOOL_NAME},
                messages=[{"role": "user", "content": [content_block, {"type": "text", "text": _request_text(hints, local_hint)}]}],
            )
        except (anthropic.APITimeoutError, anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.InternalServerError) as error:
            last_error = error
            time.sleep(min(2**attempt, 10))
            continue
        except anthropic.APIStatusError as error:
            raise AIUnavailableError(str(error)) from error

        tool_use = next((block for block in response.content if block.type == "tool_use" and block.name == TOOL_NAME), None)
        if not tool_use:
            last_error = AIInvalidResponseError("model did not call submit_extraction")
            continue

        usage = response.usage
        return {
            "tool_input": tool_use.input,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cache_read_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
            "cache_write_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        }

    if isinstance(last_error, AIInvalidResponseError):
        raise last_error
    raise AIUnavailableError(str(last_error) if last_error else "exhausted retries")
