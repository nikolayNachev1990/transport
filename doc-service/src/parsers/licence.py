"""Level-1 parser for EU-format driving licences (Directive 2006/126/EC).

Every EU licence carries the same numbered fields, whatever the country's
language: 1 surname, 2 given names, 3 date/place of birth, 4a issue date,
4b expiry date, 4c authority, 5 licence number, 9 categories. The numbers
survive OCR far better than the printed labels around them, so lines are
matched on their leading field number and the values voted across OCR
variants.
"""
import datetime
import re
from collections import Counter
from dataclasses import dataclass, field

from PIL import Image

import ocr
from parsers import common
from parsers.registration import ParseResult

CATEGORIES = ["AM", "A1", "A2", "A", "B1", "BE", "B", "C1E", "C1", "CE", "C", "D1E", "D1", "DE", "D", "T", "L", "F", "S"]
_LABEL_RE = re.compile(r"^\s*(?P<label>1|2|3|4\s?[abc]|5|9)\s*[.,:)]?\s+(?P<value>\S.*)$", re.IGNORECASE)
_DATE_RE = re.compile(r"(\d{2})[.,/-](\d{2})[.,/-](\d{2,4})")


def _expand_year(year: int, *, future_ok: bool) -> int:
    if year >= 100:
        return year
    century = 2000 if year <= (datetime.date.today().year + (25 if future_ok else 0)) % 100 else 1900
    return century + year


def _date(text: str, *, future_ok: bool) -> str | None:
    match = _DATE_RE.search(text.translate(common._DIGIT_FIX) if not re.search(r"\d", text) else text)
    if not match:
        return None
    day, month, year = (int(g) for g in match.groups())
    try:
        parsed = datetime.date(_expand_year(year, future_ok=future_ok), month, day)
    except ValueError:
        return None
    return parsed.isoformat() if datetime.date(1900, 1, 1) <= parsed <= datetime.date(2100, 1, 1) else None


_NAME_PARTICLES = {"de", "da", "di", "del", "van", "von", "der", "den", "la", "le", "el", "al", "bin", "ibn"}


def _clean_name(value: str) -> str | None:
    """A name is capitalised words. A lowercase 3+ letter word that isn't a
    known particle means OCR read a label, a slogan or noise, not a name."""
    cleaned = re.sub(r"[^A-Za-zÀ-ž' -]", "", value).strip(" -'")
    words = cleaned.split()
    if not words or len(cleaned) < 2 or len(cleaned) > 40:
        return None
    for word in words:
        if word.lower() in _NAME_PARTICLES:
            continue
        if len(word) < 2 or (word.islower() and len(word) >= 3):
            return None
    return cleaned


def _number(value: str) -> str | None:
    token = re.sub(r"[^A-Z0-9]", "", common.to_latin(value).upper().split()[0]) if value.split() else ""
    return token if len(token) >= 6 and re.search(r"\d", token) else None


def _categories(value: str) -> list[str]:
    found = []
    for part in re.split(r"[/\s,;]+", common.to_latin(value).upper()):
        part = re.sub(r"[^A-Z0-9]", "", part)
        if part in CATEGORIES and part not in found:
            found.append(part)
    return found


def parse_image(image: Image.Image) -> ParseResult | None:
    texts = ocr.text_variants(image)
    votes: dict[str, Counter] = {name: Counter() for name in ("surname", "given", "dob", "issue", "expiry", "number", "categories")}
    for text in texts:
        seen: set[tuple[str, str]] = set()
        for line in text.splitlines():
            match = _LABEL_RE.match(line)
            if not match:
                continue
            label = re.sub(r"\s", "", match.group("label")).lower()
            value = match.group("value")
            candidate: tuple[str, str] | None = None
            if label == "1" and (name := _clean_name(value)):
                candidate = ("surname", name)
            elif label == "2" and (name := _clean_name(value)):
                candidate = ("given", name)
            elif label == "3" and (d := _date(value, future_ok=False)):
                candidate = ("dob", d)
            elif label == "4a" and (d := _date(value, future_ok=False)):
                candidate = ("issue", d)
            elif label == "4b" and (d := _date(value, future_ok=True)):
                candidate = ("expiry", d)
            elif label == "5" and (n := _number(value)):
                candidate = ("number", n)
            elif label == "9" and (cats := _categories(value)):
                candidate = ("categories", "/".join(cats))
            if candidate and candidate not in seen:
                seen.add(candidate)
                votes[candidate[0]][candidate[1]] += 1

    best: dict[str, tuple[str, float]] = {}
    for name, counter in votes.items():
        if counter:
            value, count = counter.most_common(1)[0]
            # Share of the candidates seen for this field (rivals lower it),
            # scaled down while fewer than 3 runs back the winner — a lone
            # read is not agreement, however unopposed.
            best[name] = (value, round(count / sum(counter.values()) * min(1.0, count / 3), 3))
    if "number" not in best and "surname" not in best:
        return None

    result = ParseResult(type_code="driving_licence")
    if "number" in best:
        result.fields["document_number"] = best["number"][0]
        result.confidence["document_number"] = best["number"][1]
    if "issue" in best:
        result.fields["valid_from"] = best["issue"][0]
        result.confidence["valid_from"] = best["issue"][1]
    if "expiry" in best:
        result.fields["valid_to"] = best["expiry"][0]
        result.confidence["valid_to"] = best["expiry"][1]
    if "categories" in best:
        result.fields["attributes"] = {"categories": [{"category": c} for c in best["categories"][0].split("/")]}
        result.confidence["categories"] = best["categories"][1]
    if "surname" in best:
        name = best["surname"][0] + (f" {best['given'][0]}" if "given" in best else "")
        result.subject["driver_name"] = name
        result.confidence["driver_name"] = min(best["surname"][1], best["given"][1]) if "given" in best else best["surname"][1]
    result.extras = {"dob": best.get("dob", (None,))[0], "surname": best.get("surname", (None,))[0], "given": best.get("given", (None,))[0]}
    return result
