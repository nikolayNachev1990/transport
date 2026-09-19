"""The safety property of Level 1, over every labelled file: whatever it
returns, no expected field may be WRONG with confidence >= 0.7. Reading
'WMAH172Z04W000000' for 'WMAH17ZZ04W000000' at 0.75 is the failure this
guards — OCR misreads Z as 2 identically in every variant, so agreement
between variants is not evidence."""
import json
import os

import pytest

import level1
import quality

ROOT = "/fixtures/documents/"
CASES = [c for c in json.load(open(os.path.join(os.path.dirname(__file__), "..", "tools", "eval_set.json"))) if os.path.exists(ROOT + c["file"])]
CODES = {c["type"] for c in CASES} | {"registration_certificate_trailer", "technical_inspection_trailer", "tachograph_card", "mtpl"}


def flat(fields, subject):
    out = {k: v for k, v in fields.items() if k != "attributes" and v is not None}
    out.update({f"attributes.{k}": v for k, v in (fields.get("attributes") or {}).items()})
    out.update({f"subject.{k}": v for k, v in subject.items()})
    return out


@pytest.mark.parametrize("case", CASES, ids=[c["file"].split("/")[-1] for c in CASES])
def test_no_expected_field_is_wrong_with_high_confidence(case):
    data = open(ROOT + case["file"], "rb").read()
    analysis = level1.analyze(data, None, CODES, quality.score_bytes(data))
    if analysis.result:
        fields, subject, confidence = analysis.result.fields, analysis.result.subject, analysis.result.confidence
    elif analysis.partial:
        fields, subject, confidence = analysis.partial.fields, analysis.partial.subject, analysis.partial.confidence
    else:
        return
    values = flat(fields, subject)
    for name, truth in case["expect"].items():
        got = values.get(name)
        if got is None or str(got).upper() == str(truth).upper():
            continue
        key = name.split(".", 1)[-1]
        assert confidence.get(key, 0.0) < level1.MIN_FIELD_CONFIDENCE, f"{name}={got!r} (truth {truth!r}) at confidence {confidence.get(key)}"
