"""OCR helpers for Level-1 parsers. Photos and scans of ID-like documents
(guilloche backgrounds, holograms, stamps) defeat a single OCR pass, so
everything here runs several preprocessing variants and lets the parsers
vote — cheaper than an AI call, and the vote count doubles as a confidence
signal (SPEC-doc-service.md §4.3).
"""
from collections import Counter

import pytesseract
from PIL import Image, ImageFilter, ImageOps

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


def token_votes(image: Image.Image, scales=(2,), thresholds=(110, 130, 150, 170), psms=(6, 11), lang: str = "eng+bul") -> tuple[Counter, int, str]:
    """Runs OCR under several preprocessings and counts, per distinct token,
    how many runs produced it. Returns (votes, run_count, best_full_text) —
    the full text of the most productive run is kept for classification."""
    gray = ImageOps.grayscale(image)
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


def text_variants(image: Image.Image, scale: int = 2, thresholds=(0, 110, 130, 150, 170), psms=(6, 4), lang: str = "eng+bul") -> list[str]:
    """Full OCR text under several preprocessings (threshold 0 = grayscale
    without binarization). Line-oriented parsers vote across these."""
    gray = ImageOps.grayscale(image)
    big = gray.resize((gray.width * scale, gray.height * scale), Image.LANCZOS)
    texts = []
    for threshold in thresholds:
        prepared = big if threshold == 0 else _binarize(big, threshold)
        for psm in psms:
            texts.append(pytesseract.image_to_string(prepared, lang=lang, config=f"--psm {psm}"))
    return texts
