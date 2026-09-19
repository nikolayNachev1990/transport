import io

from PIL import Image

import pipeline
import quality

DIR = "/fixtures/documents/"


def test_sharp_large_scan_is_full_quality():
    image = Image.open(DIR + "registration_certificates/bulgaria_generic_part1_front_eu.jpg")
    assert quality.score(image) == 1.0


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
    assert pipeline._try_level1(b"irrelevant", "image/jpeg", {"registration_certificate"}, 0.3) is None
