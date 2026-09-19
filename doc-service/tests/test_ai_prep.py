import io

import fitz
from PIL import Image

import ai_prep
import loader

DIR = "/fixtures/documents/"


def test_phone_sized_photo_is_shrunk_below_the_api_limit():
    data = open(DIR + "driver_cards/germany_cpc_front_wikimedia.jpg", "rb").read()  # 6543x4131
    prepared, mime = ai_prep.prepare(data, "image/jpeg")
    image = Image.open(io.BytesIO(prepared))
    assert mime == "image/jpeg"
    assert max(image.size) <= ai_prep.MAX_IMAGE_EDGE
    assert len(prepared) <= ai_prep.MAX_IMAGE_BYTES


def test_small_image_is_passed_through_untouched():
    data = open(DIR + "driving_licences/bulgaria_licence_bg5_recto_ec_europa.jpg", "rb").read()
    assert ai_prep.prepare(data, "image/jpeg") == (data, "image/jpeg")


def test_heic_is_converted_and_still_readable_by_the_loader():
    image = Image.open(DIR + "driving_licences/bulgaria_licence_bg5_recto_ec_europa.jpg").convert("RGB")
    buffer = io.BytesIO()
    image.save(buffer, format="HEIF")
    heic = buffer.getvalue()
    prepared, mime = ai_prep.prepare(heic, "image/heic")
    assert mime == "image/jpeg" and Image.open(io.BytesIO(prepared)).size == image.size
    assert loader.load(heic, "image/heic").kind == "image"


def test_long_pdf_is_cut_to_its_first_pages():
    data = open(DIR + "insurance_policies/bulgaria_casco_dzi_ubb_general_terms.pdf", "rb").read()  # 17 pages
    prepared, mime = ai_prep.prepare(data, "application/pdf")
    assert mime == "application/pdf"
    with fitz.open(stream=prepared, filetype="pdf") as pdf:
        assert pdf.page_count == ai_prep.MAX_PDF_PAGES


def test_short_pdf_is_untouched():
    data = open(DIR + "technical_inspections/bulgaria_car_inspection_rta_uti_2021.pdf", "rb").read()
    assert ai_prep.prepare(data, "application/pdf") == (data, "application/pdf")


def test_unreadable_bytes_pass_through_for_an_honest_error():
    assert ai_prep.prepare(b"not a file", "image/jpeg") == (b"not a file", "image/jpeg")
