"""Level 1: extraction without AI (SPEC-doc-service.md §4).

A Level-1 result is only *returned* when every field the type requires was
found with enough confidence. Anything less returns None and the caller
falls through to the AI tier — a partial local guess is never published as
if it were complete. Confidence is the OCR vote share, so a field the
engine kept flip-flopping on (Z vs 2 in a VIN) blocks the local route.
"""
import io

from PIL import Image

import loader
from parsers import inspection_bg, licence, registration

MIN_FIELD_CONFIDENCE = 0.7
IMAGE_PARSERS = (registration.parse_image, licence.parse_image, inspection_bg.parse_image)
TEXT_PARSERS = (inspection_bg.parse_texts,)

# Fields that must be present and confident before a type may skip the AI.
REQUIRED = {
    "registration_certificate": ("registration_number", "vin", "document_number"),
    "registration_certificate_trailer": ("registration_number", "vin", "document_number"),
    "driving_licence": ("document_number", "valid_to", "driver_name"),
    "cpc_card": ("document_number", "valid_to", "driver_name"),
    "tachograph_card": ("document_number", "valid_to", "driver_name"),
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


def extract(file_bytes: bytes, mime_type: str | None, allowed_type_codes: set[str]) -> Level1Result | None:
    try:
        document = loader.load(file_bytes, mime_type)
    except loader.UnsupportedFormatError:
        return None

    attempts: list[registration.ParseResult] = []
    native_texts = [page.text for page in document.pages if page.source == "native"]
    if native_texts:
        for text_parser in TEXT_PARSERS:
            if parsed := text_parser(native_texts):
                attempts.append(parsed)
    # Photos, and PDF pages that had no text layer (rendered to an image by
    # the loader). Three pages is plenty for these single-sheet documents.
    for page in document.pages[:3]:
        if page.image is None:
            continue
        for image_parser in IMAGE_PARSERS:
            if parsed := image_parser(page.image):
                attempts.append(parsed)

    for parsed in attempts:
        if parsed.type_code not in allowed_type_codes:
            continue
        if not _sufficient(parsed.type_code, parsed):
            print(f"level1: {parsed.type_code} found but not confident enough, confidences={parsed.confidence}")
            continue
        readability = round(sum(parsed.confidence.values()) / len(parsed.confidence), 3)
        return Level1Result(parsed.type_code, parsed.fields, parsed.subject, parsed.confidence, readability)
    return None
