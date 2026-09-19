import pipeline
import quality
import validators
from parsers.registration import ParseResult

REG = {
    "code": "registration_certificate", "subject_type": "vehicle", "category": "registration", "applies_to_kinds": None, "has_expiry": False,
    "expiry_by_km": False, "default_validity_months": None, "default_validity_days": None, "requires_number": True, "has_country": False,
    "multiple_active": False, "required_when": "always", "attributes_schema": {"type": "object"}, "is_sensitive": False,
}
MTPL = {**REG, "code": "mtpl", "category": "insurance", "has_expiry": True}
TYPES = {"registration_certificate": REG, "mtpl": MTPL}
GOOD = {
    "detected_type_code": "registration_certificate",
    "fields": {"document_number": "000024024"},
    "detected_subject": {"vin": "WMAH17ZZ04W000000", "registration_number": "C0000BB"},
    "confidence": {"detected_type_code": 0.95},
    "readability_score": 0.9,
}


def test_validators():
    assert validators.invalid_fields({}, {"vin": "WMAH17ZZ04W000000"}) == []
    assert validators.invalid_fields({}, {"vin": "WMAH17ZZ04W0000006"}) == ["vin"], "the 18-character VIN Opus produced from an MRZ line"
    assert validators.invalid_fields({}, {"vin": "WMAH17ZZ04W00000O"}) == ["vin"], "no letter O in a VIN"
    assert validators.invalid_fields({"valid_from": "2022-13-45"}, {}) == ["valid_from"]
    assert validators.invalid_fields({"valid_from": "2022-05-01", "valid_to": "2021-05-01"}, {}) == ["valid_from", "valid_to"]


def test_a_clean_answer_is_not_escalated():
    assert pipeline.escalation_reasons(GOOD, None, TYPES, 1.0) == []


def test_invalid_vin_is_escalated():
    bad = {**GOOD, "detected_subject": {"vin": "WMAH17ZZ04W0000006"}}
    assert pipeline.escalation_reasons(bad, None, TYPES, 1.0) == ["invalid:vin"]


def test_disagreement_with_the_local_reading_is_escalated():
    partial = ParseResult(type_code="registration_certificate", fields={"document_number": "000024024"}, subject={}, confidence={"document_number": 0.9})
    disagreeing = {**GOOD, "confidence": {"detected_type_code": 0.95, "document_number": 0.5}}
    assert "disagree:document_number" in pipeline.escalation_reasons(disagreeing, partial, TYPES, 1.0)


def test_missing_required_field_and_unknown_type():
    no_number = {**GOOD, "fields": {}}
    assert pipeline.escalation_reasons(no_number, None, TYPES, 1.0) == ["missing:document_number"]
    assert "type-unsure" in pipeline.escalation_reasons({**GOOD, "detected_type_code": None}, None, TYPES, 1.0)
    no_expiry = {**GOOD, "detected_type_code": "mtpl", "fields": {"document_number": "X1"}}
    assert pipeline.escalation_reasons(no_expiry, None, TYPES, 1.0) == ["missing:valid_to"]


def test_a_blurry_photo_is_never_escalated():
    assert pipeline.escalation_reasons({**GOOD, "fields": {}}, None, TYPES, quality.UNREADABLE - 0.05) == []


def _run(monkeypatch, answers, escalation_model="claude-opus-5"):
    calls, sent = [], []

    def fake_ai(file_bytes, mime_type, allowed_types, hints, local_hint=None, model=None):
        model = model or "claude-sonnet-5"
        calls.append(model)
        return {"model": model, "tool_input": answers[len(calls) - 1], "input_tokens": 4000, "output_tokens": 300, "cache_read_tokens": 0, "cache_write_tokens": 0}

    monkeypatch.setattr(pipeline.s3_client, "get_object_bytes", lambda key: open("/fixtures/documents/registration_certificates/bulgaria_generic_part1_front_eu.jpg", "rb").read())
    monkeypatch.setattr(pipeline.ai_client, "extract", fake_ai)
    monkeypatch.setattr(pipeline.ai_client.config, "ANTHROPIC_MODEL_ESCALATION", escalation_model)
    monkeypatch.setattr(pipeline.level1, "analyze", lambda *a, **k: pipeline.level1.Analysis())
    monkeypatch.setattr(pipeline.kafka_client, "send", lambda topic, body: sent.append((topic, body)))
    pipeline.handle_extraction_requested(
        {"extraction_id": "e1", "company_id": "c1", "file_id": "f1", "file_key": "uploads/f1.jpg", "mime_type": "image/jpeg", "hints": {}, "allowed_types": [REG]}
    )
    return calls, sent


def test_pipeline_escalates_publishes_the_stronger_answer_and_bills_both_calls(monkeypatch):
    bad = {**GOOD, "detected_subject": {"vin": "WMAH17ZZ04W0000006", "registration_number": "C0000BB"}}
    calls, sent = _run(monkeypatch, [bad, GOOD])
    assert calls == ["claude-sonnet-5", "claude-opus-5"]
    completed = dict(sent)["doc.extraction.completed"]
    assert completed["detected_subject"]["vin"] == "WMAH17ZZ04W000000"
    usage_models = [body["model"] for topic, body in sent if topic == "doc.ai_usage.recorded"]
    assert usage_models == ["claude-sonnet-5", "claude-opus-5"]


def test_pipeline_does_not_escalate_a_clean_answer(monkeypatch):
    calls, sent = _run(monkeypatch, [GOOD])
    assert calls == ["claude-sonnet-5"]
    assert [t for t, _ in sent].count("doc.ai_usage.recorded") == 1


def test_escalation_can_be_switched_off(monkeypatch):
    bad = {**GOOD, "detected_subject": {"vin": "WMAH17ZZ04W0000006"}}
    calls, _ = _run(monkeypatch, [bad], escalation_model="")
    assert calls == ["claude-sonnet-5"]


def test_the_models_own_doubt_about_an_identity_field_is_a_reason():
    unsure = {**GOOD, "confidence": {"detected_type_code": 0.95, "vin": 0.4}}
    assert pipeline.escalation_reasons(unsure, None, TYPES, 1.0) == ["low-confidence:vin"]
    # a doubtful field that was not even reported is not a reason
    absent = {**GOOD, "detected_subject": {"registration_number": "C0000BB"}, "confidence": {"detected_type_code": 0.95, "vin": 0.4}}
    assert pipeline.escalation_reasons(absent, None, TYPES, 1.0) == []


def test_a_weak_but_present_local_reading_is_hinted_and_can_disagree():
    import hybrid

    weak = ParseResult(type_code="driving_licence", fields={"document_number": "Z021AB37X13"}, confidence={"document_number": 0.3})
    assert hybrid.hint_for_prompt(weak)["read"]["document_number"]["ocr_confidence"] == 0.3
    ai_answer = {"detected_type_code": "driving_licence", "fields": {"document_number": "Z2021AB37X13"}, "detected_subject": {}, "confidence": {"detected_type_code": 0.9}}
    merged = hybrid.merge(ai_answer, weak)
    assert merged["confidence"]["document_number"] <= hybrid.DISAGREE_CAP, "the disagreement is what triggers the second opinion"


def test_noise_below_the_floor_is_neither_hinted_nor_compared():
    import hybrid

    noise = ParseResult(type_code="driving_licence", fields={"document_number": "XXXX"}, confidence={"document_number": 0.1})
    assert hybrid.hint_for_prompt(noise)["read"] == {}
    ai_answer = {"detected_type_code": "driving_licence", "fields": {"document_number": "Z021"}, "detected_subject": {}, "confidence": {"document_number": 0.9}}
    assert hybrid.merge(ai_answer, noise)["confidence"]["document_number"] == 0.9


def test_a_mediocre_photo_is_still_escalated_because_the_text_may_be_legible():
    bad = {**GOOD, "detected_subject": {"vin": "WMAH17ZZ04W0000006"}}
    assert pipeline.escalation_reasons(bad, None, TYPES, 0.4) == ["invalid:vin"]


def test_an_invalid_value_never_keeps_a_usable_confidence(monkeypatch):
    bad = {**GOOD, "detected_subject": {"vin": "WMAH17ZZ04W0000006", "registration_number": "C0000BB"}, "confidence": {"detected_type_code": 0.95, "vin": 0.9}}
    _, sent = _run(monkeypatch, [bad, bad])
    completed = dict(sent)["doc.extraction.completed"]
    assert completed["confidence"]["vin"] <= 0.2
