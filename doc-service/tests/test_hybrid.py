import json

import hybrid
import pipeline
from parsers.registration import ParseResult


def partial():
    return ParseResult(
        type_code="technical_inspection",
        fields={"document_number": "14591092", "valid_to": "2022-07-22", "attributes": {"odometer_km": 53000}},
        subject={"registration_number": "XX0000XX"},
        confidence={"document_number": 0.857, "valid_to": 1.0, "odometer_km": 1.0, "registration_number": 0.667},
    )


def ai(**overrides):
    base = {
        "detected_type_code": "technical_inspection",
        "fields": {"document_number": "14591092", "valid_to": "2022-07-22", "attributes": {"odometer_km": 53000, "result": "passed"}},
        "detected_subject": {"registration_number": "XX0000XX", "vin": None},
        "confidence": {"document_number": 0.8, "valid_to": 0.9},
        "readability_score": 0.9,
    }
    base.update(overrides)
    return base


def test_agreement_raises_confidence():
    merged = hybrid.merge(ai(), partial())
    assert merged["fields"]["document_number"] == "14591092"
    assert merged["confidence"]["document_number"] >= 0.95
    assert merged["confidence"]["registration_number"] >= 0.95


def test_disagreement_keeps_ai_value_but_flags_it():
    wrong_local = partial()
    wrong_local.fields["document_number"] = "1459109"  # the OCR dropped a digit
    merged = hybrid.merge(ai(), wrong_local)
    assert merged["fields"]["document_number"] == "14591092", "the AI sees the picture and wins"
    assert merged["confidence"]["document_number"] <= hybrid.DISAGREE_CAP


def test_local_only_field_is_filled_in_when_confident_enough():
    silent_ai = ai(fields={"document_number": None, "valid_to": None, "attributes": {}}, detected_subject={})
    merged = hybrid.merge(silent_ai, partial())
    assert merged["fields"]["valid_to"] == "2022-07-22"
    assert merged["fields"]["attributes"]["odometer_km"] == 53000
    assert merged["detected_subject"]["registration_number"] == "XX0000XX"


def test_shaky_local_only_field_is_not_used():
    shaky = partial()
    shaky.confidence["valid_to"] = 0.2
    merged = hybrid.merge(ai(fields={"attributes": {}}, detected_subject={}), shaky)
    assert "valid_to" not in merged["fields"]


def test_type_disagreement_is_flagged():
    merged = hybrid.merge(ai(detected_type_code="mtpl"), partial())
    assert merged["detected_type_code"] == "mtpl"
    assert merged["confidence"]["detected_type_code"] <= hybrid.DISAGREE_CAP


def test_prompt_hint_carries_local_doubt():
    hint = hybrid.hint_for_prompt(partial())
    assert hint["read"]["subject.registration_number"]["ocr_confidence"] == 0.667
    assert json.dumps(hint)


def test_pipeline_publishes_a_hybrid_result(monkeypatch):
    """Whole handler with S3, AI and Kafka stubbed: Level 1 reads the 2021
    certificate but can't vouch for the plate, the AI confirms it -> engine
    'hybrid', no 'local', usage event still emitted."""
    data = open("/fixtures/documents/technical_inspections/bulgaria_car_inspection_rta_uti_2021.pdf", "rb").read()
    sent = []
    seen_hint = {}

    def fake_ai(file_bytes, mime_type, allowed_types, hints, local_hint=None, model=None):
        seen_hint["hint"] = local_hint
        return {"model": "claude-sonnet-5", "tool_input": ai(), "input_tokens": 4000, "output_tokens": 300, "cache_read_tokens": 0, "cache_write_tokens": 0}

    monkeypatch.setattr(pipeline.s3_client, "get_object_bytes", lambda key: data)
    monkeypatch.setattr(pipeline.ai_client, "extract", fake_ai)
    monkeypatch.setattr(pipeline.kafka_client, "send", lambda topic, body: sent.append((topic, body)))

    pipeline.handle_extraction_requested(
        {
            "extraction_id": "e1", "company_id": "c1", "file_id": "f1", "file_key": "uploads/f1.pdf", "mime_type": "application/pdf", "hints": {},
            "allowed_types": [
                {"code": "technical_inspection", "subject_type": "vehicle", "category": "inspection", "applies_to_kinds": None, "has_expiry": True,
                 "expiry_by_km": False, "default_validity_months": 12, "default_validity_days": None, "requires_number": True, "has_country": False,
                 "multiple_active": False, "required_when": "always", "attributes_schema": {"type": "object"}, "is_sensitive": False}
            ],
        }
    )
    topics = [t for t, _ in sent]
    completed = dict(sent)["doc.extraction.completed"]
    assert completed["engine"] == "hybrid"
    assert seen_hint["hint"]["type_code"] == "technical_inspection"
    assert "doc.ai_usage.recorded" in topics
