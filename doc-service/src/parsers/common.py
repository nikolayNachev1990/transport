"""Normalization shared by the Level-1 parsers."""
import datetime
import re

_CYRILLIC_LOOKALIKES = str.maketrans("АВЕКМНОРСТУХаеорсух", "ABEKMHOPCTYXaeopcyx")
_DIGIT_FIX = str.maketrans({"O": "0", "o": "0", "Q": "0", "I": "1", "l": "1", "|": "1", "S": "5", "B": "8", "Z": "2", "G": "6"})
BG_PLATE_LETTERS = "ABEKMHOPCTYX"


def to_latin(text: str) -> str:
    return text.translate(_CYRILLIC_LOOKALIKES)


def alnum_upper(token: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", to_latin(token).upper())


def parse_date(token: str) -> datetime.date | None:
    """dd.mm.yyyy (also , / -) with digit-lookalike repair; None if it can't
    be a plausible document date."""
    match = re.fullmatch(r"([0-9OoIlSBZ]{2})[.,/-]([0-9OoIlSBZ]{2})[.,/-]([0-9OoIlSBZ]{4})", token.strip())
    if not match:
        return None
    day, month, year = (int(part.translate(_DIGIT_FIX)) if part.translate(_DIGIT_FIX).isdigit() else -1 for part in match.groups())
    try:
        parsed = datetime.date(year, month, day)
    except ValueError:
        return None
    return parsed if datetime.date(1950, 1, 1) <= parsed <= datetime.date(2100, 1, 1) else None


def vote_strings(candidates: dict[str, int]) -> tuple[str, float]:
    """Per-position majority vote over same-length strings, weighted by how
    many OCR runs produced each. Returns (consensus, confidence) where
    confidence is the weakest position's winning share — a single contested
    character (Z vs 2) caps the whole field's confidence."""
    if not candidates:
        return "", 0.0
    length = max(candidates, key=lambda s: sum(c for k, c in candidates.items() if len(k) == len(s)))
    pool = {s: c for s, c in candidates.items() if len(s) == len(length)}
    total = sum(pool.values())
    chars, weakest = [], 1.0
    for position in range(len(length)):
        tally: dict[str, int] = {}
        for string, count in pool.items():
            tally[string[position]] = tally.get(string[position], 0) + count
        winner = max(tally, key=tally.get)
        chars.append(winner)
        weakest = min(weakest, tally[winner] / total)
    return "".join(chars), weakest
