"""Ground truth from the two real Code-XL certificates in
tester/fixtures/documents/xl_certificates (scanned PDFs). Numbers and VINs
repeat across pages, so both are voted across the page OCR."""
import level1

DIR = "/fixtures/documents/xl_certificates/"
LOW = level1.MIN_FIELD_CONFIDENCE


def analyse(name):
    return level1.analyze(open(DIR + name, "rb").read(), "application/pdf", {"xl_certificate"})


def value_or_flagged(result, name, truth):
    value = {**result.fields, **result.subject}.get(name)
    confidence = result.confidence.get(name, 0.0)
    assert value == truth or confidence < LOW, f"{name}={value!r} (truth {truth!r}) with confidence {confidence}"


def test_german_tuv_certificate_for_a_koegel_trailer():
    analysis = analyse("germany_trailer_xl_certificate_peterspedition.pdf")
    parsed = analysis.result or analysis.partial
    assert parsed is not None
    assert getattr(parsed, "type_code") == "xl_certificate"


def test_german_values_are_exact_or_flagged():
    from loader import load
    from parsers import xl_certificate

    pages = load(open(DIR + "germany_trailer_xl_certificate_peterspedition.pdf", "rb").read()).pages
    result = xl_certificate.parse_pages([p.text for p in pages], [1 for _ in pages])
    assert result.fields.get("document_number")
    value_or_flagged(result, "document_number", "8115026166-Z1")
    value_or_flagged(result, "vin", "WK0S0002400224823")


def test_austrian_schwarzmueller_certificate():
    from loader import load
    from parsers import xl_certificate

    pages = load(open(DIR + "austria_trailer_xl_certificate_heimtrans.pdf", "rb").read()).pages
    result = xl_certificate.parse_pages([p.text for p in pages], [1 for _ in pages])
    assert result.fields.get("document_number")
    value_or_flagged(result, "document_number", "Z-0515-SPBW-13620-27")
    value_or_flagged(result, "vin", "VAVWS1339FD364100")


def test_uk_guide_is_not_a_certificate():
    """A guide *about* the standard mentions 'EN 12642-XL' but names no certificate or VIN."""
    result = analyse("uk_trailer_xl_certification_donbur.pdf")
    assert result.result is None
