"""Objective image quality, independent of what any reader claims.

A 276x393 thumbnail of a protocol made the AI report "technical_inspection,
document number 9300" with confidence 0.85 — both wrong; it simply could not
see. Whatever the model or the OCR votes say, a photo too small or too blurry
to read must not yield high-confidence fields, so the score computed here
caps every confidence and the readability_score of a result.
"""
import io

import cv2
import numpy as np
import pytesseract

import ocr
from PIL import Image, ImageOps

LOW_QUALITY = 0.6
# Below this nothing legible can be recovered: no local parsing, no second
# opinion (a stronger model does not make a 4 px letter readable). Between
# the two, work proceeds but every confidence is capped at the quality, so
# a local reading can never reach the 0.7 needed to answer alone.
UNREADABLE = 0.35


def _text_height_score(image: Image.Image) -> float:
    """How tall are the letters that can actually be read, in pixels? That —
    not the file's dimensions — decides legibility: a 559 px card photo has
    14 px text and reads fine, a 276 px protocol has ~3 px text and nothing
    can read it.

    Measured with the same preprocessing the parsers use (2x upscale +
    threshold, best of two thresholds): a plain grayscale pass reads a Part II
    card's guilloche background as noise and scored it like the unreadable
    thumbnail (36 vs 35 mean confidence), the binarised pass separates them
    (27-51 confident words at 10-11 px against 2 at 2.5 px)."""
    gray = ImageOps.grayscale(image)
    if max(gray.size) > 2400:
        ratio = 2400 / max(gray.size)
        gray = gray.resize((round(gray.width * ratio), round(gray.height * ratio)))
    big = gray.resize((gray.width * 2, gray.height * 2), Image.LANCZOS)
    best_heights: list[float] = []
    for threshold in (130, 150):
        data = pytesseract.image_to_data(ocr._binarize(big, threshold), lang="eng", config="--psm 11", output_type=pytesseract.Output.DICT)
        heights = [
            data["height"][i] / 2
            for i, text in enumerate(data["text"])
            if len(text.strip()) >= 3 and float(data["conf"][i]) >= 70
        ]
        if len(heights) > len(best_heights):
            best_heights = heights
    if len(best_heights) < 5:
        return 0.3
    median = sorted(best_heights)[len(best_heights) // 2]
    if median >= 13:
        return 1.0
    if median >= 10:
        return 0.85
    if median >= 8:
        return 0.65
    if median >= 5:
        return 0.45
    return 0.3


def _sharpness_score(image: Image.Image) -> float:
    """Variance of the Laplacian on a fixed-size grayscale copy; blur flattens it."""
    gray = np.array(image.convert("L").resize((800, round(800 * image.height / image.width))))
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    if variance < 25:
        return 0.4
    if variance < 60:
        return 0.7
    return 1.0


def score(image: Image.Image) -> float:
    return round(min(_text_height_score(image), _sharpness_score(image)), 2)


def score_bytes(data: bytes) -> float:
    """1.0 for anything that isn't a raster image (native PDF/docx/xlsx text
    is exact, so image quality doesn't apply)."""
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:  # noqa: BLE001 — not an image
        return 1.0
    return score(image)


def cap(confidence: dict | None, readability: float | None, quality: float) -> tuple[dict | None, float | None]:
    """A field can't be more certain than the picture allows."""
    if quality >= 1.0:
        return confidence, readability
    capped = {name: min(value, quality) for name, value in confidence.items() if isinstance(value, (int, float))} if confidence else confidence
    return capped, (min(readability, quality) if readability is not None else quality)
