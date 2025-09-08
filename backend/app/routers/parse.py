from __future__ import annotations

import io
from typing import Any

import fitz  # PyMuPDF
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from app.services.parser import parse_text
from app.services.ocr import extract_text_from_pdf_bytes, extract_text_from_image_bytes

router = APIRouter()


class ParseRequest(BaseModel):
    text: str


@router.post("/parse")
async def parse_endpoint(
    request: Request,
    file: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    # Basic safety limits
    MAX_PDF_BYTES = 5 * 1024 * 1024  # 5 MB
    MAX_PDF_PAGES = 5

    content_type = request.headers.get("content-type", "").lower()

    text_content: str | None = None

    if file is not None:
        # Multipart file path (PDF or image)
        ctype = (file.content_type or "application/octet-stream").lower()
        is_pdf = "pdf" in ctype
        is_image = ctype.startswith("image/") and any(x in ctype for x in ["png", "jpeg", "jpg"])
        if not (is_pdf or is_image):
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload a PDF or an image (PNG/JPEG).",
            )
        # Enforce size limit using Content-Length if present
        try:
            length = int(request.headers.get("content-length", "0"))
        except Exception:
            length = 0
        if length and length > MAX_PDF_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File too large (limit 5MB)",
            )

        data = await file.read()
        if len(data) > MAX_PDF_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File too large (limit 5MB)",
            )
        try:
            if is_pdf:
                text_content = extract_text_from_pdf_bytes(data, max_pages=MAX_PDF_PAGES, ocr_lang="eng")
            else:
                text_content = extract_text_from_image_bytes(data, lang="eng")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    else:
        # JSON path
        if "application/json" not in content_type:
            raise HTTPException(
                status_code=400,
                detail='Send a PDF file or JSON {"text": "..."}.',
            )
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body.")
        if not isinstance(payload, dict) or "text" not in payload:
            raise HTTPException(status_code=400, detail="Body must include 'text'.")
        text_content = str(payload.get("text") or "")

    rows, unparsed = parse_text(text_content or "")
    # Convert dataclasses to dicts
    return {
        "rows": [
            {
                "test_name": r.test_name,
                "value": r.value,
                "unit": r.unit,
                "reference_range": r.reference_range,
                "flag": r.flag,
                "confidence": r.confidence,
            }
            for r in rows
        ],
        "unparsed_lines": unparsed,
    }
