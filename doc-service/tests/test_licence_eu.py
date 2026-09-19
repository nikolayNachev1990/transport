"""Ground truth read by eye from the specimen images in
tester/fixtures/documents/driving_licences. A wrong field is only tolerated
if it comes with a confidence low enough for a human to be told to check."""
from PIL import Image

from parsers import licence

DIR = "/fixtures/documents/driving_licences/"
LOW = 0.7


def parse(name):
    image = Image.open(DIR + name)
    image.load()
    return licence.parse_image(image)


def field(result, name):
    value = {**result.fields, **result.subject}.get(name)
    return value, result.confidence.get(name, 0.0)


def check(result, name, truth):
    value, confidence = field(result, name)
    assert value == truth or confidence < LOW, f"{name}={value!r} (truth {truth!r}) reported with confidence {confidence}"


def test_germany():
    result = parse("germany_licence_wikipedia.jpg")
    check(result, "document_number", "Z021AB37X13")
    check(result, "driver_name", "Mustermann Erika")
    assert result.extras["dob"] == "1964-08-12"
    assert [c["category"] for c in result.fields["attributes"]["categories"]][:2] == ["AM", "B"]


def test_italy():
    result = parse("italy_licence_wikipedia.jpg")
    check(result, "document_number", "A0A000000A")
    check(result, "valid_from", "2014-03-01")
    check(result, "valid_to", "2025-01-01")
    check(result, "driver_name", "ROSSI MARIA")


def test_greece():
    result = parse("greece_licence_wikipedia.jpg")
    check(result, "valid_from", "2019-02-19")
    check(result, "valid_to", "2029-02-18")
    assert [c["category"] for c in result.fields["attributes"]["categories"]] == ["AM", "A", "B"]
