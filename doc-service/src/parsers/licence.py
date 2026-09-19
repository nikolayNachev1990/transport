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
# A field label is a number (or 4a-4f) followed by punctuation. Several can
# share a line ("4a. 19.01.2013  4b. 19.01.2018"). The lookbehind keeps the
# "9." inside "19." from being read as a label.
_LABEL_AT = re.compile(r"(?<![\w.])(?P<label>1|2|3|4\s?[a-f]|5\s?[ab]?|8|9)\s?[.,:)]\s*(?=\S)", re.IGNORECASE)
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


def _labeled_values(line: str) -> list[tuple[str, str]]:
    marks = list(_LABEL_AT.finditer(line))
    return [
        (re.sub(r"\s", "", mark.group("label")).lower(), line[mark.end() : marks[i + 1].start() if i + 1 < len(marks) else len(line)].strip())
        for i, mark in enumerate(marks)
    ]


def _clean_name(value: str) -> str | None:
    """Capitalised words only. The first word must be a real name or the
    whole thing is a label/slogan/noise; after that, reading stops at the
    first junk token (OCR often appends stray fragments from the guilloche)."""
    cleaned = re.sub(r"[^A-Za-zÀ-žА-я' -]", "", value).strip(" -'")
    words = cleaned.split()
    if not words or len(cleaned) > 60:
        return None
    kept: list[str] = []
    for index, word in enumerate(words):
        if word.lower() in _NAME_PARTICLES and index > 0:
            kept.append(word)
        elif word[0].isupper() and len(word) >= (2 if index == 0 else 3) and not (word.islower() and len(word) >= 3):
            kept.append(word)
        else:
            break
    while kept and kept[-1].lower() in _NAME_PARTICLES:
        kept.pop()
    return " ".join(kept) if kept else None


def _number(value: str) -> str | None:
    token = re.sub(r"[^A-Z0-9]", "", common.to_latin(value).upper().split()[0]) if value.split() else ""
    return token if len(token) >= 6 and re.search(r"\d", token) else None


_CPC_WORDS = re.compile(r"qualifi|квалификац|kwalifikac|kvalifik|profesn|carte de qualification|fimo|\bcqc\b|code 95|код 95", re.IGNORECASE)
_TACHO_WORDS = re.compile(r"tachograph|conducteur|driver card|fahrerkarte|tarjeta del conductor|karta kierowcy|тахограф|carta del conducente|kuljettajakortti", re.IGNORECASE)


def _kind(text: str) -> str:
    """Title words tell the numbered-field cards apart: a driver-qualification
    card and a tachograph card use the same 1-9 layout as a licence."""
    if _CPC_WORDS.search(text):
        return "cpc"
    if _TACHO_WORDS.search(text):
        return "tacho"
    return "licence"


def _authority(value: str) -> str | None:
    cleaned = re.sub(r"[^A-Za-zÀ-žА-я0-9 .&-]", "", value).strip()
    return cleaned if len(cleaned) >= 3 and re.search(r"[A-Za-zÀ-žА-я]{3}", cleaned) else None


def _categories(value: str) -> list[str]:
    found = []
    for part in re.split(r"[/\s,;]+", common.to_latin(value).upper()):
        part = re.sub(r"[^A-Z0-9]", "", part)
        if part in CATEGORIES and part not in found:
            found.append(part)
    return found


def parse_image(image: Image.Image) -> ParseResult | None:
    texts = ocr.text_variants(image)
    votes: dict[str, Counter] = {name: Counter() for name in ("surname", "given", "dob", "issue", "expiry", "number", "number_5a", "number_5b", "authority", "categories")}
    kind_votes = Counter(_kind(text) for text in texts)
    for text in texts:
        seen: set[tuple[str, str]] = set()
        for line in text.splitlines():
            for label, value in _labeled_values(line):
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
                elif label == "5a" and (n := _number(value)):
                    candidate = ("number_5a", n)
                elif label == "5b" and (n := _number(value)):
                    candidate = ("number_5b", n)
                elif label == "4c" and (a := _authority(value)):
                    candidate = ("authority", a)
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
    if not any(name in best for name in ("number", "number_5a", "number_5b", "surname")):
        return None

    kind = "cpc" if kind_votes["cpc"] else "tacho" if kind_votes["tacho"] else "licence"
    type_code, number_field = {
        "licence": ("driving_licence", "number" if "number" in best else "number_5a"),
        "cpc": ("cpc_card", "number_5b" if "number_5b" in best else "number_5a"),
        "tacho": ("tachograph_card", "number_5a" if "number_5a" in best else "number"),
    }[kind]

    result = ParseResult(type_code=type_code)
    if number_field in best:
        result.fields["document_number"] = best[number_field][0]
        result.confidence["document_number"] = best[number_field][1]
    if "issue" in best:
        result.fields["valid_from"] = best["issue"][0]
        result.confidence["valid_from"] = best["issue"][1]
    if "expiry" in best:
        result.fields["valid_to"] = best["expiry"][0]
        result.confidence["valid_to"] = best["expiry"][1]
    if type_code == "driving_licence" and "categories" in best:
        result.fields["attributes"] = {"categories": [{"category": c} for c in best["categories"][0].split("/")]}
        result.confidence["categories"] = best["categories"][1]
    if type_code == "tachograph_card" and "authority" in best:
        result.fields["attributes"] = {"issuing_authority": best["authority"][0]}
        result.confidence["issuing_authority"] = best["authority"][1]
    if "surname" in best:
        name = best["surname"][0] + (f" {best['given'][0]}" if "given" in best else "")
        result.subject["driver_name"] = name
        result.confidence["driver_name"] = min(best["surname"][1], best["given"][1]) if "given" in best else best["surname"][1]
    result.extras = {
        "dob": best.get("dob", (None,))[0],
        "surname": best.get("surname", (None,))[0],
        "given": best.get("given", (None,))[0],
        "licence_number": best.get("number_5a", best.get("number", (None,)))[0],
        "serial_number": best.get("number_5b", (None,))[0],
        "authority": best.get("authority", (None,))[0],
    }
    return result
