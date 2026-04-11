from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.services.ocr import extract_text_from_image_bytes, extract_text_from_pdf_bytes
from app.services.parser import extract_report_date, parse_text
from app.services.parse_pipeline import (
    ParseServiceError,
    build_parse_response,
    collect_uploads,
    extract_text_from_json_payload,
    extract_text_from_uploads,
)

router = APIRouter()


@router.post("/parse")
async def parse_endpoint(
    request: Request,
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "").lower()
    try:
        content_length = int(request.headers.get("content-length", "0"))
    except Exception:
        content_length = None

    upload_list = collect_uploads(file, files)

    if upload_list:
        try:
            text_content = await extract_text_from_uploads(
                upload_list,
                content_length=content_length,
            )
        except ParseServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    else:
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body.")
        if not isinstance(payload, dict) or "text" not in payload:
            raise HTTPException(status_code=400, detail="Body must include 'text'.")
        text_content = str(payload.get("text") or "")

    source_text = text_content or ""
    rows, unparsed = parse_text(source_text)
    observed_at = extract_report_date(source_text)
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
        "meta": {
            "report_date": observed_at.isoformat() if observed_at else None,
        },
        "extracted_text": source_text,
    }
