"""Level-1 parser for DIN EN 12642 "Code XL" load-securing certificates for
trailer bodies (issued by TÜV and similar, or supplied by the manufacturer).

The certificate identifies one trailer: a certificate number and the VIN,
both repeated on several pages, which makes agreement across pages the
natural confidence signal (a native-text page counts as full agreement).
The type has no expiry (SPEC-fleet-service.md §4, xl_certificate).
"""
import re
from collections import Counter

from parsers import common
from parsers.registration import ParseResult

IS_XL = re.compile(r"12642", re.IGNORECASE)
XL_MARK = re.compile(r"code\s*xl|\bxl\b", re.IGNORECASE)
VIN = re.compile(r"(?<![A-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Z0-9])")
NUMBER_PATTERNS = [
    re.compile(r"Zertifikat[\s-]*Nr\.?\s*:?\s*([A-Z0-9][A-Z0-9/\-]{5,25})", re.IGNORECASE),
    re.compile(r"Certificate\s*(?:No\.?|Number|Nr\.?)\s*:?\s*([A-Z0-9][A-Z0-9/\-]{5,25})", re.IGNORECASE),
    re.compile(r"\bNr\.\s*(Z-[A-Z0-9\-]{5,25})"),
    re.compile(r"(?m)^\s*(\d{8,12}-[Z2]\d{1,2})\s*$"),
]
NATIVE_WEIGHT = 3


def _clean(value: str) -> str:
    """TÜV certificate numbers are <8-12 digits>-Z<n>; OCR reads the Z as a 2
    almost every time ("8115026166-21"), and a bare "-21" suffix is not a
    format TÜV issues, so it is restored to -Z1."""
    value = value.strip("-/ .")
    return re.sub(r"^(\d{8,12})-2(\d{1,2})$", r"\1-Z\2", value)


def parse_pages(texts: list[str], weights: list[int]) -> ParseResult | None:
    if not any(IS_XL.search(t) and XL_MARK.search(t) for t in texts):
        return None

    numbers: Counter = Counter()
    vins: Counter = Counter()
    for text, weight in zip(texts, weights):
        seen_numbers, seen_vins = set(), set()
        for pattern in NUMBER_PATTERNS:
            for match in pattern.finditer(text):
                value = _clean(match.group(1).upper())
                # a "number" made only of letters is a word that followed the label
                if re.search(r"\d", value):
                    seen_numbers.add(value)
        for candidate in VIN.findall(text.upper()):
            # a real VIN has a serial part: joined-up words that happen to be
            # 17 letters long ("...GERECHT") carry almost no digits
            if len(re.findall(r"\d", candidate)) >= 4 and re.search(r"[A-Z]", candidate):
                seen_vins.add(candidate)
        numbers.update({v: weight for v in seen_numbers})
        vins.update({v: weight for v in seen_vins})

    if not numbers and not vins:
        return None

    def best(counter: Counter):
        if not counter:
            return None
        value, count = counter.most_common(1)[0]
        return value, round(count / sum(counter.values()) * min(1.0, count / 3), 3)

    result = ParseResult(type_code="xl_certificate", type_evidence_strong=True)
    if number := best(numbers):
        result.fields["document_number"], result.confidence["document_number"] = number
    if vin := best(vins):
        result.subject["vin"], result.confidence["vin"] = vin
    return result
