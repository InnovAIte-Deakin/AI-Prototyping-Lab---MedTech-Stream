from __future__ import annotations

import json
import os
import time
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError


class ParsedRowIn(BaseModel):
    test_name: str
    value: float | str
    unit: str | None = None
    reference_range: str | None = None
    flag: str | None = Field(default=None, pattern=r"^(low|high|normal|abnormal)$")
    confidence: float


class PerTestItem(BaseModel):
    test_name: str
    explanation: str


class FlagItem(BaseModel):
    test_name: str
    severity: str
    note: str


class InterpretationOut(BaseModel):
    summary: str
    per_test: list[PerTestItem]
    flags: list[FlagItem]
    next_steps: list[str]
    disclaimer: str


SYS_PROMPT = (
    "You are a careful clinical educator. You explain lab results in clear, plain English. "
    "You must not diagnose or prescribe. Output strictly and only valid JSON; no prose."
)


def _build_user_prompt(rows: list[ParsedRowIn]) -> str:
    # Trim to essential fields and rows to keep payload small
    MAX_ROWS = 30
    trimmed = [
        {
            "test_name": r.test_name,
            "value": r.value,
            "unit": r.unit,
            "reference_range": r.reference_range,
            "flag": r.flag,
        }
        for r in rows[:MAX_ROWS]
    ]
    instructions = (
        "Given the following parsed lab rows, produce a JSON object with keys: "
        "summary (<=120 words), per_test (array of {test_name, explanation}), "
        "flags (array of {test_name, severity, note}), next_steps (array of 4-6 strings), "
        "disclaimer (short). The first item of next_steps must be: "
        '"Please schedule a visit with your doctor to review these results '
        'and your overall health." '
        "Keep total length around 200-300 words. Educational only. "
        "No diagnosis or treatment. Return JSON only with double quotes."
    )
    return instructions + "\n\nROWS:\n" + json.dumps(trimmed, ensure_ascii=False)


def _fallback_interpretation(rows: list[ParsedRowIn]) -> InterpretationOut:
    flagged: list[FlagItem] = []
    for r in rows:
        if r.flag in {"low", "high", "abnormal"}:
            sev = "high" if r.flag == "high" else ("low" if r.flag == "low" else "moderate")
            flagged.append(
                FlagItem(
                    test_name=r.test_name,
                    severity=sev,
                    note=f"Marked as {r.flag} by the lab parser.",
                )
            )

    summary_parts: list[str] = []
    total = len(rows)
    highs = sum(1 for r in rows if r.flag == "high")
    lows = sum(1 for r in rows if r.flag == "low")
    abns = sum(1 for r in rows if r.flag == "abnormal")
    summary_parts.append(f"Parsed {total} tests.")
    if highs:
        summary_parts.append(f"{highs} above reference range.")
    if lows:
        summary_parts.append(f"{lows} below reference range.")
    if abns:
        summary_parts.append(f"{abns} marked as abnormal.")
    summary = (
        " ".join(summary_parts)
        or "Your results have been summarized for discussion with your clinician."
    )

    per_test: list[PerTestItem] = []
    for r in rows[:10]:  # keep it concise
        val = r.value
        unit = f" {r.unit}" if r.unit else ""
        rr = f" (ref: {r.reference_range})" if r.reference_range else ""
        fl = f" — {r.flag} relative to reference" if r.flag else ""
        per_test.append(
            PerTestItem(
                test_name=r.test_name,
                explanation=(
                    f"Reported value: {val}{unit}{rr}.{fl} "
                    "This information is educational and not a diagnosis."
                ),
            )
        )

    next_steps = [
        "Please schedule a visit with your doctor to review these results and your overall health.",
        "Ask which results are most important for your situation and why.",
        "Discuss any symptoms, medications, and recent changes in your lifestyle.",
        "Clarify the recommended follow-up tests or monitoring intervals.",
        "Request guidance on nutrition, exercise, or other supportive habits.",
    ]

    disclaimer = (
        "Educational information only. Not a diagnosis or treatment recommendation. "
        "Always consult a qualified clinician."
    )

    return InterpretationOut(
        summary=summary,
        per_test=per_test,
        flags=flagged[:8],
        next_steps=next_steps,
        disclaimer=disclaimer,
    )


async def _call_openai_chat(prompt: str, timeout_s: float) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not configured")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1/chat/completions")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYS_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]


async def interpret_rows(rows: list[ParsedRowIn]) -> tuple[InterpretationOut, dict[str, Any]]:
    start = time.perf_counter()
    meta: dict[str, Any] = {"llm": "none", "attempts": 0}
    try:
        prompt = _build_user_prompt(rows)
        # First attempt
        meta["llm"] = "openai"
        meta["attempts"] = 1
        raw = await _call_openai_chat(prompt, timeout_s=4.5)
        try:
            obj = json.loads(raw)
            parsed = InterpretationOut.model_validate(obj)
            meta["ok"] = True
            return parsed, meta
        except (json.JSONDecodeError, ValidationError):
            # One repair attempt: ask the model to return only valid JSON
            meta["attempts"] = 2
            repair_prompt = (
                "Return the same content as strict valid JSON only. "
                "Do not include any prose or code fences."
            )
            raw2 = await _call_openai_chat(prompt + "\n\n" + repair_prompt, timeout_s=4.5)
            obj2 = json.loads(raw2)
            parsed2 = InterpretationOut.model_validate(obj2)
            meta["ok"] = True
            return parsed2, meta
    except Exception:
        # Fall back silently
        meta["ok"] = False

    finally:
        meta["duration_ms"] = int((time.perf_counter() - start) * 1000)

    # Fallback path with deterministic JSON
    fb = _fallback_interpretation(rows)
    return fb, meta
