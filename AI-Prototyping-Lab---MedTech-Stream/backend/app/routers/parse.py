from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from app.services.ocr import extract_text_from_image_bytes, extract_text_from_pdf_bytes
from app.services.parser import parse_text

router = APIRouter()


class ParseRequest(BaseModel):
    text: str


@router.post("/parse")
async def parse_endpoint(
    request: Request,
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
) -> dict[str, Any]:
    # Safety limits
    MAX_FILE_BYTES = 500 * 1024 * 1024  # 500 MB per file
    MAX_PDF_PAGES = 5  # keep conservative for runtime cost
    MAX_FILES = 5

    content_type = request.headers.get("content-type", "").lower()

    text_content: str | None = None

    # Select file inputs (support legacy single-file field and new multi-file field)
    upload_list: list[UploadFile] = []
    if files:
        upload_list.extend([f for f in files if f is not None])
    if file is not None:
        upload_list.append(file)

    if upload_list:
        # Multipart file path (PDF or image)
        if len(upload_list) > MAX_FILES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Too many files (max {MAX_FILES}).",
            )

        # Enforce total request size if Content-Length present
        try:
            total_len = int(request.headers.get("content-length", "0"))
        except Exception:
            total_len = 0
        max_total = MAX_FILE_BYTES * MAX_FILES
        if total_len and total_len > max_total:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"Payload too large (max {MAX_FILES} files, "
                    f"{MAX_FILE_BYTES // (1024*1024)}MB each)."
                ),
            )

        parts_text: list[str] = []
        for f in upload_list:
            ctype = (f.content_type or "application/octet-stream").lower()
            is_pdf = "pdf" in ctype
            is_image = (
                ctype.startswith("image/") and any(x in ctype for x in ["png", "jpeg", "jpg"])
            ) or (
                (f.filename is not None)
                and any(f.filename.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg"])
            )

            if not (is_pdf or is_image):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Unsupported file type for {f.filename or 'upload'}. "
                        "Use PDF or image (PNG/JPEG)."
                    ),
                )

            data = await f.read()
            if len(data) > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=(
                        f"{f.filename or 'file'} exceeds "
                        f"{MAX_FILE_BYTES // (1024*1024)}MB limit."
                    ),
                )
            try:
                if is_pdf:
                    t = extract_text_from_pdf_bytes(data, max_pages=MAX_PDF_PAGES, ocr_lang="eng")
                else:
                    t = extract_text_from_image_bytes(data, lang="eng")
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to read file {f.filename or ''}: {e}",
                )
            if t := (t or "").strip():
                parts_text.append(t)
        text_content = "\n".join(parts_text)
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
    payload_rows = []
    for i, r in enumerate(rows, start=1):
        d = {
            "id": f"r{i}",
            "test_name": r.test_name,
            "test_name_raw": r.test_name_raw,
            "value": r.value,
            "value_text": r.value_text or (str(r.value) if r.value is not None else None),
            "value_num": r.value_num,
            "unit": r.unit,
            "unit_raw": r.unit_raw,
            "reference_range": r.reference_range,
            "comparator": r.comparator,
            "flag": r.flag,
            "confidence": r.confidence,
            "page": r.page,
            "bbox": r.bbox,
            "raw_line": r.raw_line,
        }
        payload_rows.append(d)

    return {
        "rows": payload_rows,
        "unparsed_lines": unparsed,
        "unparsed": [{"page": None, "text": s} for s in unparsed],
        "meta": {},
        "extracted_text": text_content or "",
    }
