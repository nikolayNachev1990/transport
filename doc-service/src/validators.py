"""Format checks on what a reader (OCR or AI) returned. A value that cannot
be valid is worth a second, stronger opinion — and until it gets one its
confidence must not stay high.

Measured cases: an AI read a VIN as 18 characters by running the owner id on
to it; another dropped a character from a licence number's neighbour field.
"""
import datetime
import re

VIN_RE = re.compile(r"[A-HJ-NPR-Z0-9]{17}")


def _iso_date(value) -> bool:
    try:
        parsed = datetime.date.fromisoformat(str(value))
    except ValueError:
        return False
    return datetime.date(1900, 1, 1) <= parsed <= datetime.date(2100, 1, 1)


def invalid_fields(fields: dict, subject: dict) -> list[str]:
    """Names of returned values that fail their format check."""
    bad = []
    vin = (subject or {}).get("vin")
    if vin and not VIN_RE.fullmatch(str(vin).upper()):
        bad.append("vin")
    for name in ("valid_from", "valid_to"):
        value = (fields or {}).get(name)
        if value and not _iso_date(value):
            bad.append(name)
    if fields.get("valid_from") and fields.get("valid_to") and _iso_date(fields["valid_from"]) and _iso_date(fields["valid_to"]):
        if fields["valid_to"] < fields["valid_from"]:
            bad.extend(["valid_from", "valid_to"])
    return sorted(set(bad))
