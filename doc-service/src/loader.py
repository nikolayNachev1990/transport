"""Turns any accepted upload (image, PDF, Word, Excel) into per-page text —
the input every Level-1 parser works on (SPEC-doc-service.md §4.1).

Text that is already digital (born-digital PDF, docx, xlsx) is read
directly and never OCR'd; OCR only runs for images and for PDF pages with
no usable text layer. That's the whole point of Level 1: no OCR cost and no
AI cost when the document already contains its own text.
"""
import io
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field

import fitz  # PyMuPDF
import openpyxl
import pytesseract
from docx import Document as DocxDocument
from PIL import Image
from pillow_heif import register_heif_opener

import config

register_heif_opener()  # iPhone photos are HEIC by default

MAX_DECODE_EDGE = 3000  # a 6543x4131 phone photo decodes to ~80 MB; nothing here reads finer detail than this
MIN_NATIVE_TEXT_CHARS = 40
PDF_RENDER_DPI = 200


@dataclass
class Page:
    text: str
    source: str  # "native" | "ocr"
    image: Image.Image | None = None


@dataclass
class LoadedDocument:
    pages: list[Page] = field(default_factory=list)
    kind: str = "unknown"  # image | pdf | docx | doc | xlsx

    @property
    def text(self) -> str:
        return "\n".join(page.text for page in self.pages)


class UnsupportedFormatError(Exception):
    pass


def _ocr(image: Image.Image) -> str:
    return pytesseract.image_to_string(image, lang=config.OCR_LANGUAGES)


def _load_image(data: bytes) -> LoadedDocument:
    image = Image.open(io.BytesIO(data))
    if max(image.size) > MAX_DECODE_EDGE:
        # JPEG can be decoded at reduced size straight from the file (cheap);
        # other formats are shrunk after decoding.
        image.draft("RGB", (MAX_DECODE_EDGE, MAX_DECODE_EDGE))
    image.load()
    if max(image.size) > MAX_DECODE_EDGE:
        image.thumbnail((MAX_DECODE_EDGE, MAX_DECODE_EDGE), Image.LANCZOS)
    # Always a plain in-memory Image: HEIC files open as a pillow-heif
    # subclass that pytesseract refuses, and palette/CMYK modes OCR badly.
    image = image.convert("L" if image.mode == "L" else "RGB")
    return LoadedDocument(pages=[Page(text=_ocr(image), source="ocr", image=image)], kind="image")


def _load_pdf(data: bytes) -> LoadedDocument:
    pages: list[Page] = []
    with fitz.open(stream=data, filetype="pdf") as pdf:
        for pdf_page in pdf:
            native = pdf_page.get_text().strip()
            if len(native) >= MIN_NATIVE_TEXT_CHARS:
                pages.append(Page(text=native, source="native"))
                continue
            pixmap = pdf_page.get_pixmap(dpi=PDF_RENDER_DPI)
            image = Image.open(io.BytesIO(pixmap.tobytes("png")))
            pages.append(Page(text=_ocr(image), source="ocr", image=image))
    return LoadedDocument(pages=pages, kind="pdf")


def _load_docx(data: bytes) -> LoadedDocument:
    document = DocxDocument(io.BytesIO(data))
    lines = [paragraph.text for paragraph in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            lines.append(" | ".join(cell.text.strip() for cell in row.cells))
    return LoadedDocument(pages=[Page(text="\n".join(lines), source="native")], kind="docx")


def _load_doc(data: bytes) -> LoadedDocument:
    with tempfile.NamedTemporaryFile(suffix=".doc") as handle:
        handle.write(data)
        handle.flush()
        for tool in ("antiword", "catdoc"):
            if not shutil.which(tool):
                continue
            result = subprocess.run([tool, handle.name], capture_output=True, timeout=30)
            text = result.stdout.decode("utf-8", errors="replace")
            if result.returncode == 0 and text.strip():
                return LoadedDocument(pages=[Page(text=text, source="native")], kind="doc")
    raise UnsupportedFormatError("legacy .doc could not be read")


def _load_xlsx(data: bytes) -> LoadedDocument:
    workbook = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    pages = []
    for sheet in workbook.worksheets:
        rows = [" | ".join(str(cell) for cell in row if cell is not None) for row in sheet.iter_rows(values_only=True)]
        pages.append(Page(text="\n".join(row for row in rows if row.strip()), source="native"))
    return LoadedDocument(pages=pages, kind="xlsx")


def load(data: bytes, mime_type: str | None = None, filename: str | None = None) -> LoadedDocument:
    """Dispatch on mime type, falling back to magic bytes — a mislabeled or
    missing mime type shouldn't decide whether a file can be read at all."""
    if data[:4] == b"%PDF":
        return _load_pdf(data)
    if data[:2] == b"PK":
        lowered = (filename or "").lower()
        if lowered.endswith(".xlsx") or (mime_type or "").endswith("spreadsheetml.sheet"):
            return _load_xlsx(data)
        return _load_docx(data)
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return _load_doc(data)
    try:
        return _load_image(data)
    except Exception as error:
        raise UnsupportedFormatError(str(error)) from error
