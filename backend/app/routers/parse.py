from __future__ import annotations

import io
from typing import Any

import fitz  # PyMuPDF
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from app.services.parser import parse_text

router = APIRouter()


class ParseRequest(BaseModel):
    text: str


@router.post("/parse")
async def parse_endpoint(
    request: Request,
    file: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "").lower()

    text_content: str | None = None

    if file is not None:
        # Multipart PDF path
        if "pdf" not in (file.content_type or "application/octet-stream"):
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload a PDF.",
            )
        data = await file.read()
        # Use PyMuPDF to extract text from memory bytes
        try:
            with fitz.open(stream=io.BytesIO(data), filetype="pdf") as doc:
                parts: list[str] = []
                for page in doc:
                    parts.append(page.get_text("text"))
                text_content = "\n".join(parts)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read PDF: {e}")
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
