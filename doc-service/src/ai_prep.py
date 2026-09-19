"""Makes a file safe and cheap to send to the AI.

- Phone photos are 3-13 MB; the API rejects images over 5 MB, so an
  unprepared upload would fail as "AI unavailable". Anything bigger than the
  API can use (long edge ~1568 px) is downscaled and re-encoded as JPEG, which
  also cuts upload time and image tokens.
- HEIC (iPhone default) and TIFF are not accepted by the API: converted to JPEG.
- A 40-page policy-conditions PDF would cost ~60k tokens for a certificate that
  sits on page 1: PDFs are cut to their first pages.
"""
import io

import fitz
from PIL import Image
from pillow_heif import register_heif_opener

register_heif_opener()

MAX_IMAGE_EDGE = 1568
MAX_IMAGE_BYTES = 4_500_000
MAX_PDF_PAGES = 3
API_NATIVE_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _prepare_image(data: bytes, mime_type: str) -> tuple[bytes, str]:
    image = Image.open(io.BytesIO(data))
    image.load()
    too_large = max(image.size) > MAX_IMAGE_EDGE or len(data) > MAX_IMAGE_BYTES
    if mime_type in API_NATIVE_IMAGE_TYPES and not too_large:
        return data, mime_type

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    if max(image.size) > MAX_IMAGE_EDGE:
        ratio = MAX_IMAGE_EDGE / max(image.size)
        image = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.LANCZOS)
    for quality in (90, 80, 70):
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality)
        if buffer.tell() <= MAX_IMAGE_BYTES:
            break
    return buffer.getvalue(), "image/jpeg"


def _prepare_pdf(data: bytes) -> bytes:
    with fitz.open(stream=data, filetype="pdf") as source:
        if source.page_count <= MAX_PDF_PAGES:
            return data
        trimmed = fitz.open()
        trimmed.insert_pdf(source, from_page=0, to_page=MAX_PDF_PAGES - 1)
        return trimmed.tobytes()


def prepare(data: bytes, mime_type: str | None) -> tuple[bytes, str | None]:
    """Returns (bytes, mime) ready for the API. Formats it can't interpret are
    passed through unchanged so the caller reports the real error."""
    try:
        if data[:4] == b"%PDF":
            return _prepare_pdf(data), "application/pdf"
        return _prepare_image(data, mime_type or "")
    except Exception as error:  # noqa: BLE001
        print(f"ai_prep: could not prepare file, sending as is: {error}")
        return data, mime_type
