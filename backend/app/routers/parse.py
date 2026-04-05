from __future__ import annotations

from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

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
        try:
            text_content = extract_text_from_json_payload(content_type, payload)
        except ParseServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return build_parse_response(text_content)
