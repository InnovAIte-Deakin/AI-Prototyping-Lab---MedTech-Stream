from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.llm import ParsedRowIn, interpret_rows, call_gpt5_chat

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


class ChatRequest(BaseModel):
    question: str
    interpretation_context: str = ""
    rows: list[ParsedRowIn] = Field(default_factory=list)


@router.post("/chat")
async def chat_endpoint(payload: ChatRequest) -> dict[str, Any]:
    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question must be non-empty")

    context = (payload.interpretation_context or "").strip()
    rows_summary = ""
    if payload.rows:
        rows_summary = "Lab results: " + "; ".join(
            f"{r.test_name}={r.value}{' ' + r.unit if r.unit else ''} ({r.flag or 'normal'})"
            for r in payload.rows[:15]
        )

    prompt = (
        "A patient is asking a follow-up question about their lab report.\n\n"
        + (rows_summary + "\n\n" if rows_summary else "")
        + (f"Previous explanation:\n{context}\n\n" if context else "")
        + f"Patient question: {question}\n\n"
        "Answer in plain English. Be reassuring, educational, and concise (2-4 sentences). "
        "Do not diagnose. Do not prescribe. Advise discussing with their doctor for clinical concerns."
    )

    try:
        text, _ = await asyncio.to_thread(call_gpt5_chat, prompt)
        answer = (text or "").strip()
        if not answer:
            answer = "I'm unable to provide an answer right now. Please consult your clinician for clinical questions."
    except Exception:
        answer = "I'm unable to provide an answer right now. Please consult your clinician for clinical questions."

    return {"answer": answer}
