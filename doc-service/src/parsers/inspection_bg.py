"""Level-1 parser for the Bulgarian roadworthiness certificate
("Удостоверение за техническа изправност на ППС", issued by the technical
inspection stations under the Executive Agency Automobile Administration).

The certificate prints a fixed set of labelled lines in Bulgarian:
  Протокол №: 14591092        Прегледът е извършен на: 22.07.2021 г.
  Рег. № CA1234BH             Подлежи на преглед до: 22.07.2022 г.
  Километропоказател: 53000 km    Категория ППС: M1
Labels are matched with a tolerance for OCR damage ("№" often comes back as
"Ме" or "Ne"); values are validated by format before they are counted.
"""
import re
from collections import Counter

from PIL import Image

import mrz
import ocr
from parsers import common
from parsers.registration import ParseResult

TITLE = re.compile(r"ТЕХНИЧЕСКА\s+ИЗПРАВНОСТ|Roadworthiness\s+Certificate", re.IGNORECASE)
DATE = r"(\d{2}[.,/-]\d{2}[.,/-]\d{4})"
PATTERNS = {
    "protocol": re.compile(r"Протокол\W{0,3}[^\d\n]{0,6}(\d{6,9})", re.IGNORECASE),
    "done": re.compile(r"извършен\s+на\W{0,3}\s*" + DATE, re.IGNORECASE),
    "due": re.compile(r"Подлежи\s+на\s+преглед\s+до\W{0,3}\s*" + DATE, re.IGNORECASE),
    "odometer": re.compile(r"Километро\w*\W{0,3}\s*(\d[\d ]{0,7})", re.IGNORECASE),
    "category": re.compile(r"Категория\s+ППС\W{0,4}\s*([A-Za-zА-Яа-я])\s?(\d)", re.IGNORECASE),
    # "Рег." is often read with Latin lookalikes (Per, Pег) — accept both alphabets
    "plate": re.compile(r"[РPp][еeEЕ][гrГ]\W{0,4}\s*(?:№|N\w{0,2})?\W{0,3}\s*([A-Za-zА-Яа-я0-9]{6,9})", re.IGNORECASE),
    "passed": re.compile(r"ДОПУСКА\s+ДА\s+СЕ\s+ДВИЖИ", re.IGNORECASE),
}
CONFIDENT_NATIVE = 3  # a native-text page is exact: count it as full agreement


def _candidates(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    if match := PATTERNS["protocol"].search(text):
        found["protocol"] = match.group(1)
    for key in ("done", "due"):
        if (match := PATTERNS[key].search(text)) and (parsed := common.parse_date(match.group(1))):
            found[key] = parsed.isoformat()
    if match := PATTERNS["odometer"].search(text):
        digits = match.group(1).replace(" ", "")
        if 1 <= len(digits) <= 7:
            found["odometer"] = digits
    if match := PATTERNS["category"].search(text):
        letter = common.to_latin(match.group(1)).upper()
        if letter in "MNO":
            found["category"] = letter + match.group(2)
    for match in PATTERNS["plate"].finditer(text):
        plate = mrz._repair_plate(common.alnum_upper(match.group(1)))
        if plate:
            found["plate"] = plate
            break
    if PATTERNS["passed"].search(text):
        found["passed"] = "yes"
    return found


def _assemble(votes: dict[str, Counter], per_vote_weight: int, total_variants: int) -> ParseResult | None:
    def best(name):
        counter = votes[name]
        if not counter:
            return None
        value, count = counter.most_common(1)[0]
        confidence = round(count / sum(counter.values()) * min(1.0, count * per_vote_weight / 3), 3)
        return value, confidence

    protocol, done, due, odometer, category, plate = (best(n) for n in ("protocol", "done", "due", "odometer", "category", "plate"))
    if not (protocol or due or plate):
        return None

    trailer = bool(category and category[0].startswith("O"))
    result = ParseResult(type_code="technical_inspection_trailer" if trailer else "technical_inspection")
    attributes: dict = {}
    if protocol:
        result.fields["document_number"] = protocol[0]
        result.confidence["document_number"] = protocol[1]
        attributes["protocol_number"] = protocol[0]
    if done:
        result.fields["valid_from"] = done[0]
        result.confidence["valid_from"] = done[1]
    if due:
        result.fields["valid_to"] = due[0]
        result.confidence["valid_to"] = due[1]
    if odometer:
        attributes["odometer_km"] = int(odometer[0])
        result.confidence["odometer_km"] = odometer[1]
    if votes["passed"]:
        attributes["result"] = "passed"
    if attributes:
        result.fields["attributes"] = attributes
    if plate:
        result.subject["registration_number"] = plate[0]
        result.confidence["registration_number"] = plate[1]
    result.extras = {"category": category[0] if category else None}
    return result


def _vote(texts: list[str], per_vote_weight: int) -> ParseResult | None:
    # The title itself is often the first casualty of OCR; enough matched
    # labels is as good a sign that this is the certificate.
    if not any(TITLE.search(text) or len(_candidates(text)) >= 3 for text in texts):
        return None
    votes: dict[str, Counter] = {name: Counter() for name in ("protocol", "done", "due", "odometer", "category", "plate", "passed")}
    for text in texts:
        for name, value in _candidates(text).items():
            votes[name][value] += 1
    return _assemble(votes, per_vote_weight, len(texts))


def parse_texts(texts: list[str]) -> ParseResult | None:
    """Native text (born-digital PDF, docx): read once, exact."""
    return _vote(texts, per_vote_weight=CONFIDENT_NATIVE)


def parse_image(image: Image.Image) -> ParseResult | None:
    """Photo/scan: several OCR preprocessings, values voted."""
    return _vote(ocr.text_variants(ocr.normalize_size(image, 1600), thresholds=(0, 110, 130, 150, 170), psms=(6, 4)), per_vote_weight=1)
