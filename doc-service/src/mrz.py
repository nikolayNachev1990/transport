"""Machine-readable zone extraction for the Bulgarian registration
certificate Part II card (three 30-character lines):

  M<BGR<0000240240<C0000BB<2<1<<        doc number, plate
  WMAH17ZZ04W0000006002290445<<<        VIN (17) + owner EGN (10)
  NIKOLOV<<ALEKSANDAR<BALEV<<<<<        surname<<given names

Unlike a passport MRZ this layout carries no ICAO check digits, so the
repairs below lean on the format of each field instead (plate pattern,
VIN alphabet, EGN checksum).
"""
import re

import pytesseract
from PIL import Image, ImageOps

import ocr

_TO_DIGIT = str.maketrans({"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6"})
_TO_LETTER = str.maketrans({"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G"})
_EGN_WEIGHTS = (2, 4, 8, 5, 10, 9, 7, 3, 6)
_BG_PLATE_LETTERS = "ABEKMHOPCTYX"


def egn_valid(egn: str) -> bool:
    if not re.fullmatch(r"\d{10}", egn):
        return False
    total = sum(int(d) * w for d, w in zip(egn[:9], _EGN_WEIGHTS))
    return (total % 11) % 10 == int(egn[9])


def _repair_egn(raw: str) -> str | None:
    digits = raw.translate(_TO_DIGIT)
    return digits if egn_valid(digits) else None


def _repair_plate(raw: str) -> str | None:
    """BG plates are 1-2 letters, 4 digits, 2 letters (A1234BC / AB1234CD)."""
    for letters_front in (1, 2):
        if len(raw) != letters_front + 4 + 2:
            continue
        front, digits, back = raw[:letters_front], raw[letters_front : letters_front + 4], raw[-2:]
        fixed = front.translate(_TO_LETTER) + digits.translate(_TO_DIGIT) + back.translate(_TO_LETTER)
        if re.fullmatch(rf"[{_BG_PLATE_LETTERS}]{{{letters_front}}}\d{{4}}[{_BG_PLATE_LETTERS}]{{2}}", fixed):
            return fixed
    return None


def _repair_vin(raw: str) -> str:
    """VINs never contain I/O/Q; the last four characters are always digits."""
    vin = raw.replace("O", "0").replace("Q", "0").replace("I", "1")
    return vin[:13] + vin[13:].translate(_TO_DIGIT)


def find_mrz_region(image: Image.Image) -> tuple[int, int, int, int] | None:
    """Locate the MRZ block: OCR a few coarse regions with the MRZ charset and
    take the union box of words containing '<' (the filler character that
    only exists in MRZ text)."""
    gray = ImageOps.grayscale(image)
    width, height = gray.size
    regions = [(0, 0, width, height), (0, height // 2, width, height), (0, height // 2, width // 2 + width // 10, height)]
    best = None
    for left, top, right, bottom in regions:
        part = gray.crop((left, top, right, bottom))
        big = part.resize((part.width * 2, part.height * 2), Image.LANCZOS).point(lambda p: 255 if p > 130 else 0)
        data = pytesseract.image_to_data(big, lang="eng", config=f"--psm 6 {ocr.MRZ_WHITELIST}", output_type=pytesseract.Output.DICT)
        boxes = [
            (data["left"][i], data["top"][i], data["left"][i] + data["width"][i], data["top"][i] + data["height"][i])
            for i, text in enumerate(data["text"])
            if text.count("<") >= 2
        ]
        if len(boxes) < 3:
            continue
        box = (
            left + min(b[0] for b in boxes) // 2,
            top + min(b[1] for b in boxes) // 2,
            left + max(b[2] for b in boxes) // 2,
            top + max(b[3] for b in boxes) // 2,
        )
        if best is None or len(boxes) > best[0]:
            best = (len(boxes), box)
    if best is None:
        return None
    left, top, right, bottom = best[1]
    pad_x, pad_y = 12, 10
    return max(left - pad_x, 0), max(top - pad_y, 0), min(right + pad_x, width), min(bottom + pad_y, height)


def parse_bg_registration_part2(lines: list[str]) -> dict | None:
    if len(lines) != 3:
        return None
    first, second, third = (line.strip() for line in lines)
    parts = first.split("<")
    if len(parts) < 4 or parts[1] != "BGR":
        return None

    result: dict = {"document_number": parts[2] or None}
    plate = _repair_plate(parts[3])
    if plate:
        result["registration_number"] = plate

    vin_and_id = second.replace("<", "")
    if len(vin_and_id) >= 27:
        result["vin"] = _repair_vin(vin_and_id[:17])
        owner_id = _repair_egn(vin_and_id[17:27])
        if owner_id:
            result["owner_id"] = owner_id

    names = [part for part in third.split("<") if part]
    if names:
        result["owner_surname"] = names[0]
        if len(names) > 1:
            result["owner_given_names"] = " ".join(names[1:])
    return result


def read_bg_registration_part2(image: Image.Image) -> tuple[dict | None, dict[str, float]]:
    """Returns (fields, confidence per field). Confidence is the OCR vote
    score of the MRZ line the field lives on: plate and document number are
    on line 1, VIN and owner id on line 2, names on line 3."""
    box = find_mrz_region(image)
    if box is None:
        return None, {}
    variants = ocr.mrz_line_candidates(image.crop(box), expected_lines=3)
    consensus, scores = ocr.vote_lines(variants)
    fields = parse_bg_registration_part2(consensus)
    if not fields:
        return None, {}
    confidence = {
        "document_number": scores[0],
        "registration_number": scores[0],
        "vin": scores[1],
        "owner_id": scores[1],
        "owner_surname": scores[2],
        "owner_given_names": scores[2],
    }
    return fields, confidence
