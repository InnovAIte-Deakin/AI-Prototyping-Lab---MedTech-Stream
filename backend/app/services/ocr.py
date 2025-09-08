from __future__ import annotations

import io
import os
from typing import Optional

import fitz  # PyMuPDF
from PIL import Image


def _ocr_available() -> bool:
    # pytesseract import is lazy to allow running without OCR installed
    try:
        import pytesseract  # type: ignore
        return bool(pytesseract.get_tesseract_version())
    except Exception:
        return False


def _do_ocr_image(img: Image.Image, lang: Optional[str] = None) -> str:
    import pytesseract  # type: ignore

    config = os.getenv("TESSERACT_CONFIG", "")
    kwargs = {}
    if lang:
        kwargs["lang"] = lang
    text = pytesseract.image_to_string(img, config=config or None, **kwargs)
    return text or ""


def extract_text_from_image_bytes(data: bytes, lang: Optional[str] = None) -> str:
    if not _ocr_available():
        return ""
    try:
        img = Image.open(io.BytesIO(data))
    except Exception:
        return ""
    return _do_ocr_image(img, lang=lang)


def extract_text_from_pdf_bytes(
    data: bytes,
    max_pages: int = 10,
    ocr_lang: Optional[str] = None,
) -> str:
    """
    Extract text from a PDF. Use text layer first; if empty, fall back to OCR per page.
    """
    text_parts: list[str] = []
    try:
        with fitz.open(stream=io.BytesIO(data), filetype="pdf") as doc:
            # First pass: text layer
            for i, page in enumerate(doc):
                if i >= max_pages:
                    break
                t = page.get_text("text") or ""
                if t.strip():
                    text_parts.append(t)
            combined = "\n".join(text_parts).strip()
            if combined:
                return combined

            # Second pass: OCR if available
            if not _ocr_available():
                return ""
            text_parts.clear()
            for i, page in enumerate(doc):
                if i >= max_pages:
                    break
                # Render to image at higher DPI for better OCR
                pix = page.get_pixmap(dpi=200)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                text_parts.append(_do_ocr_image(img, lang=ocr_lang))
            return "\n".join(text_parts)
    except Exception:
        return ""

