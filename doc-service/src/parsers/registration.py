"""Level-1 parser for registration_certificate (talon) images — SPEC-doc-service.md §4.4.

Two routes, both without AI:
  1. Bulgarian Part II card with a machine-readable zone -> mrz.py
  2. Everything else: run OCR under several preprocessings and vote on
     format-validated candidates (VIN, plate, dates, document number).
     Field labels ((A), (E), (B)...) are too small/faint to rely on, but
     the *values* have strict formats, so they can be found without them.
"""
import re
from dataclasses import dataclass, field

from PIL import Image

import mrz
import ocr
from parsers import common

VIN_RE = re.compile(r"[A-HJ-NPR-Z0-9]{17}")


@dataclass
class ParseResult:
    type_code: str
    fields: dict = field(default_factory=dict)
    subject: dict = field(default_factory=dict)
    confidence: dict = field(default_factory=dict)
    extras: dict = field(default_factory=dict)  # not part of the event contract; kept for tests/debugging


def _vin_candidates(votes) -> dict[str, int]:
    candidates: dict[str, int] = {}
    for token, count in votes.items():
        cleaned = common.alnum_upper(token).replace("O", "0").replace("Q", "0").replace("I", "1")
        if len(cleaned) == 17 and VIN_RE.fullmatch(cleaned):
            candidates[cleaned] = candidates.get(cleaned, 0) + count
    return candidates


def _plate_candidates(votes) -> dict[str, int]:
    candidates: dict[str, int] = {}
    for token, count in votes.items():
        plate = mrz._repair_plate(common.alnum_upper(token))
        if plate:
            candidates[plate] = candidates.get(plate, 0) + count
    return candidates


def _date_candidates(votes, min_votes: int) -> list[tuple]:
    found: dict = {}
    for token, count in votes.items():
        parsed = common.parse_date(token)
        if parsed and count >= min_votes:
            found[parsed] = found.get(parsed, 0) + count
    return sorted(found.items())


def _document_number_candidates(votes, min_votes: int) -> dict[str, int]:
    candidates: dict[str, int] = {}
    for token, count in votes.items():
        cleaned = re.sub(r"[^0-9]", "", token)
        if len(cleaned) == 9 and count >= min_votes:
            candidates[cleaned] = candidates.get(cleaned, 0) + count
    return candidates


CATEGORY_RE = re.compile(r"(?:M[123]|N[123]|O[1-4])")


def _category(votes) -> str | None:
    tally: dict[str, int] = {}
    for token, count in votes.items():
        cleaned = common.alnum_upper(token)
        if CATEGORY_RE.fullmatch(cleaned):
            tally[cleaned] = tally.get(cleaned, 0) + count
    return max(tally, key=tally.get) if tally else None


def parse_image(image: Image.Image) -> ParseResult | None:
    """Returns None when nothing registration-certificate-like was found, so
    the caller falls through to the next tier instead of guessing."""
    result = ParseResult(type_code="registration_certificate")

    mrz_fields, mrz_confidence = mrz.read_bg_registration_part2(image)
    if mrz_fields and mrz_fields.get("vin") and mrz_fields.get("registration_number"):
        result.fields = {"country": "BG", "document_number": mrz_fields.get("document_number"), "attributes": {"part_2_number": mrz_fields.get("document_number")}}
        result.subject = {"vin": mrz_fields["vin"], "registration_number": mrz_fields["registration_number"], "driver_name": None}
        result.confidence = {key: round(mrz_confidence[key], 3) for key in ("registration_number", "vin", "document_number")}
        result.extras = {"source": "mrz", **{k: v for k, v in mrz_fields.items() if k.startswith("owner")}}
        return result

    votes, runs, _text = ocr.token_votes(image)
    min_votes = max(2, runs // 5)
    category = _category(votes)
    if category and category.startswith("O"):
        result.type_code = "registration_certificate_trailer"

    vin, vin_confidence = common.vote_strings(_vin_candidates(votes))
    plate, plate_confidence = common.vote_strings(_plate_candidates(votes))
    # A plate-shaped token alone is not evidence of a registration
    # certificate (a Russian policy produced one, with confidence 1.0); a
    # valid 17-character VIN is.
    if not vin:
        return None

    if vin:
        result.subject["vin"] = vin
        result.confidence["vin"] = round(vin_confidence, 3)
    if plate:
        result.subject["registration_number"] = plate
        result.confidence["registration_number"] = round(plate_confidence, 3)
        result.fields["country"] = "BG"

    numbers = _document_number_candidates(votes, min_votes)
    if numbers:
        number, number_confidence = common.vote_strings(numbers)
        result.fields["document_number"] = number
        result.confidence["document_number"] = round(number_confidence, 3)

    dates = _date_candidates(votes, min_votes)
    result.extras = {
        "source": "ocr-vote",
        "category": category,
        "dates": [d.isoformat() for d, _ in dates],
        "first_registration_date": dates[0][0].isoformat() if len(dates) >= 1 else None,
        "issue_date": dates[-1][0].isoformat() if len(dates) >= 2 else None,
    }
    return result
