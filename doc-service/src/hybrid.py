"""Hybrid extraction: the AI suggests, Level 1 cross-checks.

When Level 1 recognised the document but could not vouch for every required
field, its reading goes to the AI as an *unverified hint* and the two are
merged per field:

  both agree            -> value kept, confidence raised: two independent
                           readers (OCR votes + vision model) saw the same
  both read, differ     -> the AI's value (it sees the picture), confidence
                           capped at 0.5 so a human is told to check
  only Level 1 read it  -> kept if its own vote confidence was >= 0.5
  only the AI read it   -> as the AI reported

The point of the cross-check is the case the AI cannot flag itself: it
answers a 276 px thumbnail with confidence 0.85 and a wrong number.
"""
AGREE_CONFIDENCE = 0.95
DISAGREE_CAP = 0.5
LOCAL_ONLY_MIN = 0.5
DEFAULT_AI_CONFIDENCE = 0.8


def _flatten(fields: dict, subject: dict) -> dict:
    flat = {k: v for k, v in fields.items() if k != "attributes" and v is not None}
    flat.update({f"attributes.{k}": v for k, v in (fields.get("attributes") or {}).items() if v is not None})
    flat.update({f"subject.{k}": v for k, v in subject.items() if v is not None})
    return flat


def hint_for_prompt(partial) -> dict:
    """What the AI is told Level 1 read, with Level 1's own doubt attached."""
    flat = _flatten(partial.fields, partial.subject)
    return {
        "type_code": partial.type_code,
        "read": {name: {"value": value, "ocr_confidence": _local_confidence(partial, name)} for name, value in flat.items()},
    }


def _local_confidence(partial, flat_name: str) -> float:
    key = flat_name.split(".", 1)[-1]
    return partial.confidence.get(key, partial.confidence.get(flat_name, 0.0))


def _same(a, b) -> bool:
    return str(a).strip().upper() == str(b).strip().upper()


def merge(tool_input: dict, partial) -> dict:
    """Returns a tool_input-shaped dict (fields / detected_subject / confidence
    / detected_type_code) combining the AI answer with the local reading."""
    ai_fields = dict(tool_input.get("fields") or {})
    ai_attrs = dict(ai_fields.get("attributes") or {})
    ai_subject = dict(tool_input.get("detected_subject") or {})
    ai_conf = dict(tool_input.get("confidence") or {})
    ai_flat = _flatten({**ai_fields, "attributes": ai_attrs}, ai_subject)
    local_flat = _flatten(partial.fields, partial.subject)

    merged_fields, merged_attrs, merged_subject, confidence = {k: v for k, v in ai_fields.items() if k != "attributes"}, dict(ai_attrs), dict(ai_subject), dict(ai_conf)

    for name, local_value in local_flat.items():
        short = name.split(".", 1)[-1]
        local_conf = _local_confidence(partial, name)
        if name in ai_flat:
            if _same(ai_flat[name], local_value):
                confidence[short] = max(AGREE_CONFIDENCE, local_conf)
            else:
                confidence[short] = min(ai_conf.get(short, DEFAULT_AI_CONFIDENCE), DISAGREE_CAP)
        elif local_conf >= LOCAL_ONLY_MIN:
            if name.startswith("attributes."):
                merged_attrs[short] = local_value
            elif name.startswith("subject."):
                merged_subject[short] = local_value
            else:
                merged_fields[short] = local_value
            confidence[short] = local_conf

    if merged_attrs:
        merged_fields["attributes"] = merged_attrs
    ai_type = tool_input.get("detected_type_code")
    if ai_type and ai_type != partial.type_code:
        confidence["detected_type_code"] = min(ai_conf.get("detected_type_code", DEFAULT_AI_CONFIDENCE), DISAGREE_CAP)
    return {
        "detected_type_code": ai_type or partial.type_code,
        "fields": merged_fields,
        "detected_subject": merged_subject,
        "confidence": confidence,
        "readability_score": tool_input.get("readability_score"),
    }
