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
from PIL import Image, ImageOps

LOW_QUALITY = 0.6
# Below this nothing legible can be recovered: no local parsing, no second
# opinion (a stronger model does not make a 4 px letter readable). Between
# the two, work proceeds but every confidence is capped at the quality, so
# a local reading can never reach the 0.7 needed to answer alone.
UNREADABLE = 0.35


def _text_height_score(image: Image.Image) -> float:
    """How tall are the letters, in pixels? That — not the file's dimensions —
    decides legibility: a 559 px card photo has 14 px text and reads fine, a
    276 px protocol has ~4 px text and nothing can read it. Median height of
    the words tesseract is reasonably sure about; too few confident words
    means there is barely any legible text at all."""
    data = pytesseract.image_to_data(ImageOps.grayscale(image), lang="eng", config="--psm 11", output_type=pytesseract.Output.DICT)
    heights = [
        data["height"][i]
        for i, text in enumerate(data["text"])
        if text.strip() and len(text.strip()) >= 3 and float(data["conf"][i]) >= 50
    ]
    if len(heights) < 5:
        return 0.4
    median = sorted(heights)[len(heights) // 2]
    if median >= 16:
        return 1.0
    if median >= 12:
        return 0.85
    if median >= 9:
        return 0.65
    if median >= 6:
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
