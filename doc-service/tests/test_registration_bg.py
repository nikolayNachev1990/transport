"""Ground truth read by eye from the Bulgarian specimen images in
tester/fixtures/documents/registration_certificates (a MAN TGA 26.360 truck,
fictional owner). Two kinds of assertion:
  - the field is exactly right, or
  - it is wrong but its confidence is low enough that a human is told to check.
A wrong field reported with high confidence is the one outcome that is never
acceptable — that is what the calibration assertions guard.
"""
import datetime

import pytest
from PIL import Image

from parsers import registration

DIR = "/fixtures/documents/registration_certificates/"
TRUE_VIN = "WMAH17ZZ04W000000"
LOW_CONFIDENCE = 0.8


def load(name):
    image = Image.open(DIR + name)
    image.load()
    return image


def assert_calibrated(result, field, truth):
    value = result.subject.get(field) or result.fields.get(field)
    confidence = result.confidence[field]
    assert value == truth or confidence < LOW_CONFIDENCE, f"{field}={value!r} (truth {truth!r}) reported with confidence {confidence}"


def test_part2_front_mrz():
    result = registration.parse_image(load("bulgaria_generic_part2_front_eu.jpg"))
    assert result.extras["source"] == "mrz"
    assert result.subject["registration_number"] == "C0000BB"
    assert result.extras["owner_id"] == "6002290445"
    assert result.extras["owner_surname"] == "NIKOLOV"
    assert_calibrated(result, "vin", TRUE_VIN)


def test_part2_back_technical_data():
    result = registration.parse_image(load("bulgaria_generic_part2_back_eu.jpg"))
    assert result.subject["registration_number"] == "C0000BB"
    assert_calibrated(result, "vin", TRUE_VIN)
    assert result.fields["document_number"] == "000024024"
    assert result.extras["first_registration_date"] == datetime.date(1999, 1, 1).isoformat()
    assert result.extras["issue_date"] == datetime.date(2016, 4, 19).isoformat()


def test_part1_front():
    result = registration.parse_image(load("bulgaria_generic_part1_front_eu.jpg"))
    assert result.subject["registration_number"] == "C0000BB"
    assert_calibrated(result, "vin", TRUE_VIN)
    assert result.extras["first_registration_date"] == datetime.date(1999, 1, 1).isoformat()
    assert result.extras["issue_date"] == datetime.date(2004, 2, 11).isoformat()


def test_level1_end_to_end_from_bytes():
    """The same path the pipeline takes: bytes in, a local result or None out."""
    import level1

    allowed = {"registration_certificate", "registration_certificate_trailer"}
    data = open(DIR + "bulgaria_generic_part2_back_eu.jpg", "rb").read()
    result = level1.extract(data, "image/jpeg", allowed)
    assert result is None or result.type_code == "registration_certificate"
    if result:
        assert result.subject["registration_number"] == "C0000BB"


def test_level1_declines_unrelated_image():
    import level1

    data = open("/fixtures/documents/driving_licences/germany_licence_wikipedia.jpg", "rb").read()
    assert level1.extract(data, "image/jpeg", {"registration_certificate"}) is None


def test_foreign_policy_is_not_mistaken_for_a_registration_certificate():
    """A Russian OSAGO photo contains a plate-shaped token and a 9-digit
    number; that is not a talon and must not come back as one."""
    image = Image.open("/fixtures/documents/insurance_policies/russia_mtpl_policy_wikimedia.jpg")
    image.thumbnail((3000, 3000))
    assert registration.parse_image(image) is None
