import io

from PIL import Image

import pipeline
import quality

DIR = "/fixtures/documents/"


def test_sharp_large_scan_is_full_quality():
    image = Image.open(DIR + "registration_certificates/bulgaria_generic_part1_front_eu.jpg")
    assert quality.score(image) >= 0.85


def test_thumbnail_is_low_quality():
    """Same document shrunk to 276 px wide: the letters are ~4 px tall."""
    image = Image.open(DIR + "registration_certificates/bulgaria_generic_part1_front_eu.jpg").convert("RGB")
    thumbnail = image.resize((276, round(276 * image.height / image.width)))
    assert quality.score(thumbnail) < quality.LOW_QUALITY


def test_small_but_readable_card_is_not_thrown_away():
    """A card photo of 559x357 is what a real phone crop looks like."""
    image = Image.open(DIR + "driving_licences/bulgaria_licence_bg5_recto_ec_europa.jpg")
    assert quality.score(image) >= quality.LOW_QUALITY


def test_non_image_bytes_are_not_penalised():
    assert quality.score_bytes(b"%PDF-1.4 native text pdf") == 1.0


def test_cap_never_raises_confidence_and_lowers_readability():
    confidence, readability = quality.cap({"document_number": 0.85, "vin": 0.4}, 0.9, 0.3)
    assert confidence == {"document_number": 0.3, "vin": 0.3}
    assert readability == 0.3
    untouched = quality.cap({"vin": 0.4}, 0.9, 1.0)
    assert untouched == ({"vin": 0.4}, 0.9)


def test_low_quality_skips_level1():
    analysis = pipeline._analyze_level1(b"irrelevant", "image/jpeg", {"registration_certificate"}, quality.UNREADABLE - 0.05)
    assert analysis.result is None and analysis.partial is None


def test_mediocre_quality_caps_local_confidence_so_it_cannot_answer_alone():
    """Between UNREADABLE and LOW_QUALITY Level 1 still reads (and can hint the
    AI), but no reading can reach the 0.7 an answer needs."""
    import level1

    data = open(DIR + "driving_licences/germany_licence_wikipedia.jpg", "rb").read()
    analysis = level1.analyze(data, "image/jpeg", {"driving_licence"}, image_quality=0.5)
    assert analysis.result is None
    assert all(value <= 0.5 for value in analysis.partial.confidence.values())
