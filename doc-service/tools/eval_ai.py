"""Measures the AI tier against files with known values (tools/eval_set.json)
for one or more models: per-field accuracy, type accuracy and cost. Not part
of the service. Usage (repo root):
  docker compose run --rm --no-deps -v $PWD/tester/fixtures:/fixtures:ro \
    -v /tmp/types.json:/tmp/types.json -v $PWD/doc-service/tools:/usr/app/tools \
    doc-service python tools/eval_ai.py claude-haiku-4-5-20251001 claude-sonnet-5
(/tmp/types.json = the document_types rows, see the spec §6.1)."""
import json
import os
import sys

sys.path.insert(0, "/usr/app/src")
import ai_client  # noqa: E402
import ai_prep  # noqa: E402
import pipeline  # noqa: E402

ROOT = "/fixtures/documents/"
types = json.load(open("/tmp/types.json"))
cases = json.load(open(os.path.join(os.path.dirname(__file__), "eval_set.json")))


def flat(tool_input):
    fields = dict(tool_input.get("fields") or {})
    out = {k: v for k, v in fields.items() if k != "attributes" and v is not None}
    out.update({f"attributes.{k}": v for k, v in (fields.get("attributes") or {}).items() if v is not None})
    out.update({f"subject.{k}": v for k, v in (tool_input.get("detected_subject") or {}).items() if v is not None})
    return out


for model in sys.argv[1:]:
    ai_client.config.ANTHROPIC_MODEL = model
    total = right = type_right = n = 0
    cost = 0.0
    print(f"\n===== {model}")
    for case in cases:
        path = ROOT + case["file"]
        if not os.path.exists(path):
            continue
        data = open(path, "rb").read()
        mime = "application/pdf" if path.endswith(".pdf") else "image/jpeg"
        data, mime = ai_prep.prepare(data, mime)
        result = ai_client.extract(data, mime, types, {})
        cost += pipeline._estimate_cost_usd(model, result["input_tokens"], result["output_tokens"], result["cache_read_tokens"], result["cache_write_tokens"])
        actual = flat(result["tool_input"])
        n += 1
        type_ok = result["tool_input"]["detected_type_code"] == case["type"]
        type_right += type_ok
        wrong = []
        for name, truth in case["expect"].items():
            total += 1
            if str(actual.get(name, "")).strip().upper() == str(truth).upper():
                right += 1
            else:
                wrong.append(f"{name}: got {actual.get(name)!r} want {truth!r}")
        print(f"  {'OK ' if type_ok and not wrong else 'BAD'} {case['file'].split('/')[-1][:58]:58} type={'ok' if type_ok else result['tool_input']['detected_type_code']}", "; ".join(wrong))
    print(f"  fields {right}/{total} = {right/total:.0%} | type {type_right}/{n} | cost ${cost:.4f} (${cost/n:.4f}/doc)")
