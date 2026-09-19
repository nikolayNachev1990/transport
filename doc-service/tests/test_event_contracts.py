"""The Python schemas in src/schemas.py are hand-copied from Events/*.mjs
(Python can't import ESM). Nothing else stops them drifting: 'hybrid' was
added to the Python enum, the Node one still said ["local", "ai"], and
fleet-service silently rejected every hybrid result — the extraction sat
'queued' forever. This compares the two."""
import re

import pytest

import schemas

EVENTS = "/events/"


def body_properties(mjs: str) -> set[str]:
    body = mjs[mjs.index("body:") :]
    section = body[body.index("properties:") : body.index("required:")]
    return set(re.findall(r"^\s{6}(\w+):", section, re.MULTILINE))


def enum_of(mjs: str, field: str) -> list[str]:
    match = re.search(field + r":\s*\{[^}]*enum:\s*\[([^\]]*)\]", mjs)
    return re.findall(r'"([^"]+)"', match.group(1)) if match else []


@pytest.mark.parametrize(
    "event,python_schema",
    [
        ("doc.extraction.completed", schemas.DOC_EXTRACTION_COMPLETED_BODY),
        ("doc.extraction.failed", schemas.DOC_EXTRACTION_FAILED_BODY),
        ("doc.ai_usage.recorded", schemas.DOC_AI_USAGE_RECORDED_BODY),
        ("fleet.extraction.requested", schemas.FLEET_EXTRACTION_REQUESTED_BODY),
    ],
)
def test_property_names_match_the_node_schema(event, python_schema):
    node = open(f"{EVENTS}{event}.mjs").read()
    assert body_properties(node) == set(python_schema["properties"]), f"{event}: Python and Node property lists differ"


def test_engine_values_match():
    node = open(f"{EVENTS}doc.extraction.completed.mjs").read()
    assert sorted(enum_of(node, "engine")) == sorted(schemas.DOC_EXTRACTION_COMPLETED_BODY["properties"]["engine"]["enum"])
