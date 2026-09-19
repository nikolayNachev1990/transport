"""Scores Level 1 against real documents dropped into tester/fixtures/private
(git-ignored). Each `<file>.expected.json` holds the true values; the
sibling file is run through level1.extract exactly as the pipeline does.

Per expected field the outcome is one of:
  correct   — matches
  declined  — Level 1 refused (falls through to AI): fine, costs a few cents
  low-conf  — wrong but flagged uncertain: fine, a human is told to check
  WRONG     — wrong with high confidence: the only failure
Run with -s to see the summary table.
"""
import glob
import json
import os

import pytest

import level1

ROOT = "/fixtures/private"
CASES = sorted(glob.glob(f"{ROOT}/**/*.expected.json", recursive=True))
ALLOWED = {"registration_certificate", "registration_certificate_trailer", "driving_licence"}
HIGH = level1.MIN_FIELD_CONFIDENCE


@pytest.mark.skipif(not CASES, reason="no real documents in tester/fixtures/private yet")
@pytest.mark.parametrize("expected_path", CASES, ids=[os.path.relpath(p, ROOT) for p in CASES])
def test_real_document(expected_path):
    source = expected_path[: -len(".expected.json")]
    expected = json.load(open(expected_path))
    result = level1.extract(open(source, "rb").read(), None, ALLOWED)

    if result is None:
        print(f"\n{os.path.basename(source)}: declined -> AI ({len(expected)} fields)")
        return

    actual = {**result.fields, **result.subject}
    wrong = []
    for name, truth in expected.items():
        value, confidence = actual.get(name), result.confidence.get(name, 0.0)
        status = "correct" if value == truth else ("low-conf" if confidence < HIGH else "WRONG")
        print(f"  {os.path.basename(source)} {name}: {value!r} vs {truth!r} conf={confidence} -> {status}")
        if status == "WRONG":
            wrong.append(name)
    assert not wrong, f"high-confidence wrong fields: {wrong}"
