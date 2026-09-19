"""OCR helpers for Level-1 parsers. Photos and scans of ID-like documents
(guilloche backgrounds, holograms, stamps) defeat a single OCR pass, so
everything here runs several preprocessing variants and lets the parsers
vote — cheaper than an AI call, and the vote count doubles as a confidence
signal (SPEC-doc-service.md §4.3).
"""
from collections import Counter

import pytesseract
import re

from PIL import Image, ImageFilter, ImageOps, ImageStat

MRZ_WHITELIST = "-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"
MRZ_THRESHOLDS = (110, 120, 130, 140)
MRZ_SCALES = (3, 4)


def _binarize(image: Image.Image, threshold: int) -> Image.Image:
    return image.point(lambda p: 255 if p > threshold else 0).filter(ImageFilter.MedianFilter(3))


def mrz_line_candidates(region: Image.Image, expected_lines: int) -> list[list[str]]:
    """OCR one MRZ region under several scales/thresholds; returns one list
    of lines per variant, keeping only variants that produced the expected
    number of MRZ-looking lines (a variant that shreds the block is noise)."""
    gray = ImageOps.grayscale(region)
    variants: list[list[str]] = []
    for scale in MRZ_SCALES:
        big = gray.resize((gray.width * scale, gray.height * scale), Image.LANCZOS)
        for threshold in MRZ_THRESHOLDS:
            text = pytesseract.image_to_string(_binarize(big, threshold), lang="eng", config=f"--psm 6 {MRZ_WHITELIST}")
            lines = [line.strip() for line in text.splitlines() if line.count("<") >= 2]
            if len(lines) == expected_lines:
                variants.append(lines)
    return variants


def vote_lines(variants: list[list[str]]) -> tuple[list[str], list[float]]:
    """Per-position majority vote across variants of the same line. Returns
    the consensus lines and, per line, its *weakest* position's winning share
    (0-1) — one contested character (Z vs 2) caps that whole line's score,
    because a line is only as trustworthy as its least certain character."""
    if not variants:
        return [], []
    consensus: list[str] = []
    scores: list[float] = []
    for index in range(len(variants[0])):
        same_length = [variant[index] for variant in variants]
        target_length = Counter(len(line) for line in same_length).most_common(1)[0][0]
        pool = [line for line in same_length if len(line) == target_length]
        chars, weakest = [], 1.0
        for position in range(target_length):
            winner, count = Counter(line[position] for line in pool).most_common(1)[0]
            chars.append(winner)
            weakest = min(weakest, count / len(pool))
        consensus.append("".join(chars))
        scores.append(weakest)
    return consensus, scores


def token_votes(image: Image.Image, scales=None, thresholds=(110, 130, 150, 170), psms=(6, 11), lang: str = "eng+bul") -> tuple[Counter, int, str]:
    """Runs OCR under several preprocessings and counts, per distinct token,
    how many runs produced it. Returns (votes, run_count, best_full_text) —
    the full text of the most productive run is kept for classification."""
    gray = ImageOps.grayscale(image)
    if scales is None:
        # aim for a long edge around 3000 px (a fixed 2x made a 1240x1753
        # scan 3500 px tall; below ~3000 the Z/2 of a VIN stops being
        # readable; a 6000 px phone photo needs no enlarging at all)
        scales = (max(1, round(3000 / max(gray.size))),)
    votes: Counter = Counter()
    runs = 0
    best_text = ""
    for scale in scales:
        big = gray.resize((gray.width * scale, gray.height * scale), Image.LANCZOS)
        for threshold in thresholds:
            prepared = _binarize(big, threshold)
            for psm in psms:
                text = pytesseract.image_to_string(prepared, lang=lang, config=f"--psm {psm}")
                runs += 1
                if len(text) > len(best_text):
                    best_text = text
                votes.update({token for token in text.split() if token})
    return votes, runs, best_text


def normalize_size(image: Image.Image, target_long_edge: int = 2400) -> Image.Image:
    """Photos straight from a phone can be 6000+ px wide (OCR then takes
    minutes and gets no better); tiny scans need enlarging. Bring everything
    to a long edge near what tesseract works best with."""
    long_edge = max(image.size)
    if 0.7 * target_long_edge <= long_edge <= 1.3 * target_long_edge:
        return image
    ratio = target_long_edge / long_edge
    return image.resize((round(image.width * ratio), round(image.height * ratio)), Image.LANCZOS)


def text_variants(image: Image.Image, scale: int = 2, thresholds=(0, 110, 130, 150, 170), psms=(6, 4), lang: str = "eng+bul") -> list[str]:
    """Full OCR text under several preprocessings (threshold 0 = grayscale
    without binarization). Line-oriented parsers vote across these."""
    gray = ImageOps.grayscale(normalize_size(image, 1400))
    big = gray.resize((gray.width * scale, gray.height * scale), Image.LANCZOS)
    texts = []
    for threshold in thresholds:
        prepared = big if threshold == 0 else _binarize(big, threshold)
        for psm in psms:
            texts.append(pytesseract.image_to_string(prepared, lang=lang, config=f"--psm {psm}"))
    return texts


_DATE_LIKE = re.compile(r"\d{2}[.,/-]\d{2}[.,/-]\d{2,4}")
_FIELD_LABEL = re.compile(r"(?<![\w.])(?:[1-9]|4\s?[a-f]|5\s?[ab])\s?[.,:)]")


def crop_to_card(image: Image.Image) -> Image.Image:
    """A card photographed on a dark table: keep only the bright region.
    Bounding box of pixels brighter than the image mean; if that is almost
    the whole frame (a flat scan) or almost nothing, the image is left alone."""
    gray = ImageOps.grayscale(image)
    ratio = 256 / max(gray.size)
    small = gray.resize((max(1, round(gray.width * ratio)), max(1, round(gray.height * ratio))))
    threshold = ImageStat.Stat(small).mean[0]
    box = small.point(lambda p: 255 if p > threshold else 0).getbbox()
    if not box:
        return image
    covered = (box[2] - box[0]) * (box[3] - box[1]) / (small.width * small.height)
    if covered > 0.85 or covered < 0.15:
        return image
    margin = 0.02 * max(small.size)
    left, top = max(box[0] - margin, 0) / ratio, max(box[1] - margin, 0) / ratio
    right, bottom = min(box[2] + margin, small.width) / ratio, min(box[3] + margin, small.height) / ratio
    return image.crop((round(left), round(top), round(right), round(bottom)))


def _orientation_score(image: Image.Image) -> int:
    """How much sensible text a quick OCR pass finds: field labels and dates
    weigh heavily (they only appear when the text is upright)."""
    small = normalize_size(ImageOps.grayscale(image), 1100)
    text = pytesseract.image_to_string(small, lang="eng+bul", config="--psm 6")
    return 4 * len(_FIELD_LABEL.findall(text)) + 6 * len(_DATE_LIKE.findall(text)) + len(re.findall(r"[A-Za-zА-я]{4,}", text))


def auto_rotate(image: Image.Image) -> Image.Image:
    """Try the four right-angle rotations and keep the one that reads best.
    The upright original is kept unless another turn is clearly better —
    a flat A4 scan should never be rotated on a tie."""
    upright = _orientation_score(image)
    if upright >= 40:
        return image
    best_image, best_score = image, upright
    for angle in (90, 270, 180):
        turned = image.rotate(angle, expand=True)
        score = _orientation_score(turned)
        if score > best_score:
            best_image, best_score = turned, score
    return best_image if best_score >= upright + 6 and best_score >= 1.5 * upright else image


def prepare_card(image: Image.Image) -> Image.Image:
    return auto_rotate(crop_to_card(image))
