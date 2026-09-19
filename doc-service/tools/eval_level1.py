"""Scores Level 1 alone (no AI) against tools/eval_set.json: for each file,
did it answer by itself, was it only a hint for the AI, or nothing; and for
every expected field, was the value exact, wrong-but-flagged, or wrong with
confidence >= 0.7 (the one outcome that must never happen)."""
import json
import os
import sys
import time

sys.path.insert(0, "/usr/app/src")
import level1  # noqa: E402
import quality  # noqa: E402

ROOT = "/fixtures/documents/"
cases = json.load(open(os.path.join(os.path.dirname(__file__), "eval_set.json")))
codes = {c["type"] for c in cases} | {"registration_certificate_trailer", "technical_inspection_trailer", "tachograph_card", "mtpl"}


def flat(parsed):
    out = {k: v for k, v in parsed.fields.items() if k != "attributes" and v is not None}
    out.update({f"attributes.{k}": v for k, v in (parsed.fields.get("attributes") or {}).items()})
    out.update({f"subject.{k}": v for k, v in parsed.subject.items()})
    return out


rows = []
for case in cases:
    path = ROOT + case["file"]
    if not os.path.exists(path):
        continue
    data = open(path, "rb").read()
    q = quality.score_bytes(data)
    started = time.time()
    analysis = level1.analyze(data, None, codes, q)
    took = time.time() - started
    parsed = analysis.result or analysis.partial
    status = "LOCAL" if analysis.result else ("hint" if analysis.partial else "none")
    if analysis.result:  # Level1Result has different attribute names
        parsed_fields = type("P", (), {"fields": analysis.result.fields, "subject": analysis.result.subject, "confidence": analysis.result.confidence})
    else:
        parsed_fields = analysis.partial
    detail = []
    if parsed_fields is not None:
        values, conf = flat(parsed_fields), parsed_fields.confidence
        for name, truth in case["expect"].items():
            key = name.split(".", 1)[-1]
            got = values.get(name)
            c = conf.get(key, 0.0)
            if got is not None and str(got).upper() == str(truth).upper():
                detail.append(f"{key}=ok({c:.2f})")
            elif got is None:
                detail.append(f"{key}=missing")
            else:
                detail.append(f"{key}={'WRONG-HIGH' if c >= 0.7 else 'wrong-low'}({got!r},{c:.2f})")
    print(f"{status:5} q={q:.2f} {took:5.1f}s {case['file'].split('/')[-1][:46]:46} {' '.join(detail)}")
    rows.append((status, detail))

local = sum(1 for s, _ in rows if s == "LOCAL")
hint = sum(1 for s, _ in rows if s == "hint")
none = sum(1 for s, _ in rows if s == "none")
wrong_high = sum(1 for _, d in rows for x in d if "WRONG-HIGH" in x)
print(f"\nanswers alone: {local}/{len(rows)} | hint only: {hint} | nothing: {none} | wrong with high confidence: {wrong_high}")
