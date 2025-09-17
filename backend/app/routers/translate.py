from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services.llm import translate_summary


router = APIRouter()


SUPPORTED_LANGUAGES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "ar": "Arabic",
    "zh": "Mandarin Chinese",
    "hi": "Hindi",
    "fr": "French",
}


class TranslateRequest(BaseModel):
    text: str
    target_language: str


@router.post("/translate")
async def translate_endpoint(payload: TranslateRequest) -> Any:
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must be a non-empty string")

    code = (payload.target_language or "").strip().lower()
    if code not in SUPPORTED_LANGUAGES or code == "en":
        # We allow 'en' in the selector client-side but it produces no request.
        # If called directly with 'en', treat it as unsupported to avoid no-op calls.
        raise HTTPException(status_code=400, detail="unsupported target_language")

    label = SUPPORTED_LANGUAGES[code]
    translation, meta = await translate_summary(text, target_language=code, language_label=label)

    # Shared public meta keys from interpret + language
    public_meta_keys = [
        "duration_ms",
        "llm",
        "attempts",
        "ok",
        "model",
        "endpoint",
        "status",
        "usage",
        "finish_reason",
        "error",
        "language",
    ]
    safe_meta = {k: meta[k] for k in public_meta_keys if k in meta}

    if translation is None:
        err = (meta or {}).get("error", {}) or {}
        code = str(err.get("code") or "")
        if code in {"missing_api_key", "missing_openai_dependency"}:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": "Translation service unavailable", "meta": safe_meta},
            )
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"detail": "Translation failed", "meta": safe_meta},
        )

    return {
        "language": code,
        "translation": translation,
        "meta": safe_meta,
    }

