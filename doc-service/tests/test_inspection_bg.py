"""Ground truth read by eye from the Bulgarian roadworthiness certificate
specimens (rta.government.bg). Same rule as everywhere: exact, or wrong with
a confidence low enough for a human to be told to check."""
import datetime

from PIL import Image

import level1
from parsers import inspection_bg

DIR = "/fixtures/documents/technical_inspections/"
LOW = level1.MIN_FIELD_CONFIDENCE


def check(result, name, truth):
    value = {**result.fields, **result.subject, **result.fields.get("attributes", {})}.get(name)
    confidence = result.confidence.get(name, 0.0)
    assert value == truth or confidence < LOW, f"{name}={value!r} (truth {truth!r}) reported with confidence {confidence}"


def test_2017_photo_scan():
    image = Image.open(DIR + "bulgaria_car_inspection_rta_uti_2017_part1.jpeg")
    result = inspection_bg.parse_image(image)
    assert result.type_code == "technical_inspection"
    assert result.fields["document_number"] == "11824703"
    check(result, "document_number", "11824703")
    check(result, "valid_from", "2017-01-13")
    check(result, "valid_to", "2018-01-17")
    check(result, "odometer_km", 186236)
    check(result, "registration_number", "XX0000XX")


def test_2021_scanned_pdf():
    """The single OCR pass reads the protocol as 1459109 (drops the last digit
    of 14591092); voting across variants recovers it. Read from the rendered
    page so the parser itself, not the confidence gate, is under test."""
    page = level1.loader.load(open(DIR + "bulgaria_car_inspection_rta_uti_2021.pdf", "rb").read()).pages[0]
    result = inspection_bg.parse_image(page.image)
    assert result.fields["document_number"] == "14591092"
    assert result.fields["valid_from"] == "2021-07-22"
    assert result.fields["valid_to"] == "2022-07-22"
    assert result.fields["attributes"]["odometer_km"] == 53000
    assert result.subject["registration_number"] == "XX0000XX"
    assert result.extras["category"] == "M1"


def test_uncertain_reads_are_not_published_as_local_results():
    """Whatever the parser reads, level1 only answers when every required
    field clears the confidence bar; otherwise it declines to the AI tier."""
    result = level1.extract(open(DIR + "bulgaria_car_inspection_rta_uti_2021.pdf", "rb").read(), "application/pdf", {"technical_inspection"})
    assert result is None or all(result.confidence[f] >= level1.MIN_FIELD_CONFIDENCE for f in level1.REQUIRED["technical_inspection"])


def test_blank_2015_english_specimen_yields_nothing():
    """No values printed on the blank form — nothing to extract, and nothing invented."""
    result = level1.extract(open(DIR + "bulgaria_car_inspection_rta_uti_2015_part1.pdf", "rb").read(), "application/pdf", {"technical_inspection"})
    assert result is None
