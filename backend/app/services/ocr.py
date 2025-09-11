from __future__ import annotations

import io
import os
from typing import Optional

import fitz  # PyMuPDF
from PIL import Image


def _ocr_enabled() -> bool:
    """Check if OCR is enabled via env flag (default: enabled)."""
    return os.getenv("ENABLE_OCR", "1").strip() not in {"0", "false", "False"}


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
    if not (_ocr_enabled() and _ocr_available()):
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
    Extract text from a PDF.

    Strategy:
    - Prefer text layer for each page when it has sufficient alphabetic content.
    - If a page's text layer looks number-heavy (alphabetic-to-numeric char ratio < 0.4),
      and OCR is enabled/available, run OCR for that page and prefer the OCR text.
    - If a page has no text layer at all, fall back to OCR for that page (when enabled).
    """
    text_parts: list[str] = []

    def _alpha_num_ratio(s: str) -> float:
        letters = sum(1 for ch in s if ch.isalpha())
        digits = sum(1 for ch in s if ch.isdigit())
        if digits == 0:
            # If there are no digits, treat as sufficiently alphabetic
            return float("inf") if letters > 0 else 0.0
        return letters / digits
    try:
        with fitz.open(stream=io.BytesIO(data), filetype="pdf") as doc:
            use_ocr = _ocr_enabled() and _ocr_available()
            for i, page in enumerate(doc):
                if i >= max_pages:
                    break
                t = (page.get_text("text") or "").strip()
                if not t:
                    if use_ocr:
                        pix = page.get_pixmap(dpi=200)
                        img = Image.open(io.BytesIO(pix.tobytes("png")))
                        t_ocr = _do_ocr_image(img, lang=ocr_lang)
                        text_parts.append(t_ocr)
                    # else, append nothing for this page
                    continue

                # Heuristic: if text layer is number-heavy, prefer OCR
                if use_ocr and _alpha_num_ratio(t) < 0.4:
                    try:
                        pix = page.get_pixmap(dpi=200)
                        img = Image.open(io.BytesIO(pix.tobytes("png")))
                        t_ocr = (_do_ocr_image(img, lang=ocr_lang) or "").strip()
                        if t_ocr:
                            text_parts.append(t_ocr)
                            continue
                    except Exception:
                        # If OCR fails for this page, fall back to text layer
                        pass

                text_parts.append(t)
            return "\n".join(text_parts)
    except Exception:
        return ""
