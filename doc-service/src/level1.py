"""Level 1: extraction without AI (SPEC-doc-service.md §4).

A Level-1 result is only *returned* when every field the type requires was
found with enough confidence. Anything less returns None and the caller
falls through to the AI tier — a partial local guess is never published as
if it were complete. Confidence is the OCR vote share, so a field the
engine kept flip-flopping on (Z vs 2 in a VIN) blocks the local route.
"""
import time

from PIL import Image

import loader
from parsers import inspection_bg, licence, registration, xl_certificate

MIN_FIELD_CONFIDENCE = 0.7
# A reading is worth handing to the AI as an unverified hint from very low
# confidence: the point is the cross-check. Below this a reading is noise.
MIN_HINT_CONFIDENCE = 0.25
MIN_HINT_FIELDS = 1
# (parser, plausibility check on the loader's cheap OCR text)
IMAGE_PARSERS = (
    (registration.parse_image, registration.plausible),
    (licence.parse_image, licence.plausible),
    (inspection_bg.parse_image, inspection_bg.plausible),
)
# The consumer blocks on one message at a time and Kafka wants a heartbeat
# every 5 minutes; a scanned 3-page PDF used to spend ~3 minutes here.
LEVEL1_BUDGET_SECONDS = 60
TEXT_PARSERS = (inspection_bg.parse_texts,)
# Parsers that read every page's text at once (native pages weigh more than
# OCR'd ones): documents whose key values repeat across pages.
PAGE_PARSERS = (xl_certificate.parse_pages,)

# Fields that must be present and confident before a type may skip the AI.
REQUIRED = {
    "registration_certificate": ("registration_number", "vin", "document_number"),
    "registration_certificate_trailer": ("registration_number", "vin", "document_number"),
    "driving_licence": ("document_number", "valid_to", "driver_name"),
    "cpc_card": ("document_number", "valid_to", "driver_name"),
    "tachograph_card": ("document_number", "valid_to", "driver_name"),
    "xl_certificate": ("document_number", "vin"),
    "technical_inspection": ("document_number", "valid_to", "registration_number"),
    "technical_inspection_trailer": ("document_number", "valid_to", "registration_number"),
}


class Level1Result:
    def __init__(self, type_code: str, fields: dict, subject: dict, confidence: dict, readability: float):
        self.type_code = type_code
        self.fields = fields
        self.subject = subject
        self.confidence = confidence
        self.readability = readability


def _sufficient(type_code: str, parsed: registration.ParseResult) -> bool:
    required = REQUIRED.get(type_code)
    if not required:
        return False
    values = {**parsed.fields, **parsed.subject}
    return all(values.get(name) and parsed.confidence.get(name, 0) >= MIN_FIELD_CONFIDENCE for name in required)


class Analysis:
    """What Level 1 made of a file: `result` when every required field is
    confident (the AI can be skipped), otherwise `partial` — the best
    attempt for an allowed type, handed to the AI as an unverified hint."""

    def __init__(self, result: Level1Result | None = None, partial: registration.ParseResult | None = None):
        self.result = result
        self.partial = partial


def analyze(file_bytes: bytes, mime_type: str | None, allowed_type_codes: set[str]) -> Analysis:
    try:
        document = loader.load(file_bytes, mime_type)
    except loader.UnsupportedFormatError:
        return Analysis()

    attempts: list[registration.ParseResult] = []
    native_texts = [page.text for page in document.pages if page.source == "native"]
    if native_texts:
        for text_parser in TEXT_PARSERS:
            if parsed := text_parser(native_texts):
                attempts.append(parsed)
    page_texts = [page.text for page in document.pages[:15]]
    page_weights = [3 if page.source == "native" else 1 for page in document.pages[:15]]
    for page_parser in PAGE_PARSERS:
        if parsed := page_parser(page_texts, page_weights):
            attempts.append(parsed)
    # Photos, and PDF pages that had no text layer (rendered to an image by
    # the loader). Three pages is plenty for these single-sheet documents.
    deadline = time.monotonic() + LEVEL1_BUDGET_SECONDS
    # a printed standard/title already identified the document: no image parser will know better
    already_strong = any(a.type_evidence_strong for a in attempts)
    for page in document.pages[:3]:
        if page.image is None or already_strong:
            continue
        for image_parser, plausible in IMAGE_PARSERS:
            if time.monotonic() > deadline:
                print("level1: time budget spent, skipping remaining parsers")
                break
            # A photo may have no readable text at all (a card on a dark table,
            # an MRZ), so it always gets every parser; PDF pages are printed
            # documents whose cheap text says which parser is worth running.
            if document.kind != "image" and not plausible(page.text):
                continue
            if parsed := image_parser(page.image):
                attempts.append(parsed)

    partial = None
    partial_solid = 0
    for parsed in attempts:
        if parsed.type_code not in allowed_type_codes:
            continue
        if _sufficient(parsed.type_code, parsed):
            readability = round(sum(parsed.confidence.values()) / len(parsed.confidence), 3)
            return Analysis(result=Level1Result(parsed.type_code, parsed.fields, parsed.subject, parsed.confidence, readability))
        print(f"level1: {parsed.type_code} found but not confident enough, confidences={parsed.confidence}")
        # A German licence number read at 0.3 was exactly right while the AI
        # added a character; without the hint there is nothing to disagree with.
        solid = sum(1 for value in parsed.confidence.values() if value >= MIN_HINT_CONFIDENCE)
        if (solid >= MIN_HINT_FIELDS or parsed.type_evidence_strong) and (partial is None or solid > partial_solid):
            partial, partial_solid = parsed, solid
    return Analysis(partial=partial)


def extract(file_bytes: bytes, mime_type: str | None, allowed_type_codes: set[str]) -> Level1Result | None:
    return analyze(file_bytes, mime_type, allowed_type_codes).result
