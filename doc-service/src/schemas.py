"""Hand-mirrored copies of the event body schemas this service touches —
Python can't import the real ESM source (Events/*.mjs), so these are kept
in sync by hand. If you change one of the four files below, update this
module too (SPEC-doc-service.md §9 makes the same point for the
normalization rules — same category of unavoidable duplication).

Source of truth for each:
  - Events/fleet.extraction.requested.mjs   (consumed)
  - Events/doc.extraction.completed.mjs     (published)
  - Events/doc.extraction.failed.mjs        (published)
  - Events/doc.ai_usage.recorded.mjs        (published)

The `format: "uuid"` constraints from the .mjs originals are dropped here
(jsonschema's format checking needs an extra dependency for it, and
plain `type: string` still catches the failure modes that matter —
missing/wrong-shaped fields, not a malformed UUID specifically).
"""

NULLABLE_STRING = {"type": ["string", "null"]}

DOCUMENT_TYPE = {
    "type": "object",
    "properties": {
        "code": {"type": "string"},
        "subject_type": {"type": "string"},
        "category": {"type": "string"},
        "applies_to_kinds": {"type": ["array", "null"], "items": {"type": "string"}},
        "has_expiry": {"type": "boolean"},
        "expiry_by_km": {"type": "boolean"},
        "default_validity_months": {"type": ["number", "null"]},
        "default_validity_days": {"type": ["number", "null"]},
        "requires_number": {"type": "boolean"},
        "has_country": {"type": "boolean"},
        "multiple_active": {"type": "boolean"},
        "required_when": NULLABLE_STRING,
        "attributes_schema": {"type": "object"},
        "is_sensitive": {"type": "boolean"},
    },
    "required": [
        "code",
        "subject_type",
        "category",
        "applies_to_kinds",
        "has_expiry",
        "expiry_by_km",
        "default_validity_months",
        "default_validity_days",
        "requires_number",
        "has_country",
        "multiple_active",
        "required_when",
        "attributes_schema",
        "is_sensitive",
    ],
    "additionalProperties": False,
}

FLEET_EXTRACTION_REQUESTED_BODY = {
    "type": "object",
    "properties": {
        "extraction_id": {"type": "string"},
        "company_id": {"type": "string"},
        "file_id": {"type": "string"},
        "file_key": {"type": "string"},
        "mime_type": NULLABLE_STRING,
        "hints": {"type": "object"},
        "allowed_types": {"type": "array", "items": DOCUMENT_TYPE},
    },
    "required": ["extraction_id", "company_id", "file_id", "file_key", "mime_type", "hints", "allowed_types"],
    "additionalProperties": False,
}

DOC_EXTRACTION_COMPLETED_BODY = {
    "type": "object",
    "properties": {
        "extraction_id": {"type": "string"},
        "engine": {"type": "string", "enum": ["local", "ai", "hybrid"]},
        "detected_type_code": NULLABLE_STRING,
        "detected_subject": {"type": ["object", "null"]},
        "fields": {"type": "object"},
        "confidence": {"type": ["object", "null"]},
        "readability_score": {"type": ["number", "null"]},
    },
    "required": ["extraction_id", "engine", "detected_type_code", "detected_subject", "fields", "confidence", "readability_score"],
    "additionalProperties": False,
}

DOC_EXTRACTION_FAILED_BODY = {
    "type": "object",
    "properties": {
        "extraction_id": {"type": "string"},
        "error_code": {"type": "string"},
    },
    "required": ["extraction_id", "error_code"],
    "additionalProperties": False,
}

DOC_AI_USAGE_RECORDED_BODY = {
    "type": "object",
    "properties": {
        "extraction_id": {"type": "string"},
        "company_id": {"type": "string"},
        "model": {"type": "string"},
        "input_tokens": {"type": "number"},
        "output_tokens": {"type": "number"},
        "estimated_cost_usd": {"type": "number"},
        "occurred_at": {"type": "string"},
    },
    "required": ["extraction_id", "company_id", "model", "input_tokens", "output_tokens", "estimated_cost_usd", "occurred_at"],
    "additionalProperties": False,
}
