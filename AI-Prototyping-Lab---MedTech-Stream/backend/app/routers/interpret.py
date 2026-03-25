from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.llm import ParsedRowIn, interpret_rows

router = APIRouter()


class InterpretRequest(BaseModel):
    rows: list[ParsedRowIn] = Field(default_factory=list)


@router.post("/interpret")
async def interpret_endpoint(payload: InterpretRequest) -> dict[str, Any]:
    rows = payload.rows or []
    if not rows:
        raise HTTPException(status_code=400, detail="rows must be a non-empty array")

    result, _ = await interpret_rows(rows)
    return {
        "interpretation": result.model_dump(),
    }
