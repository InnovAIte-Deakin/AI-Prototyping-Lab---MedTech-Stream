from __future__ import annotations

import json
import os
import time
from typing import Any, Tuple, Dict

import httpx
import logging
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
    "You are a careful clinical explainer. Write in clear, plain English. "
    "Return strictly and only JSON; no code fences or extra prose outside JSON."
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
        "Given the parsed lab rows, produce a JSON object with keys: "
        "summary (a thorough multi-paragraph synthesis in prose), per_test, flags, next_steps, disclaimer. "
        "Write a detailed summary that explains patterns, relationships, and context among the results. "
        "You may analyze freely within educational bounds (no diagnosis/prescriptions). "
        "Keep JSON valid with double quotes only."
    )
    # Extra style guidance for more helpful outputs without changing API shape
    instructions += (
        " Use a patient‑friendly tone; avoid alarmist language; do not mention parsing or AI. "
        "In per_test.explanation, write 2–4 sentences: what the test measures, what this value implies "
        "relative to the provided reference, and common clinical context (without giving medical advice). "
        "For flags, use severity values 'high', 'low', or 'abnormal' with human notes such as 'Higher than reference range'."
    )
    return instructions + "\n\nROWS:\n" + json.dumps(trimmed, ensure_ascii=False)


def _fallback_interpretation(rows: list[ParsedRowIn]) -> InterpretationOut:
    def sort_key(r: ParsedRowIn) -> tuple[int, str]:
        order = {"high": 0, "abnormal": 1, "low": 2, "normal": 3, None: 3}
        return (order.get(r.flag, 3), (r.test_name or "").lower())

    rows_sorted = sorted(rows, key=sort_key)
    flagged: list[FlagItem] = []
    for r in rows_sorted:
        if r.flag in {"low", "high", "abnormal"}:
            sev = "high" if r.flag == "high" else ("low" if r.flag == "low" else "abnormal")
            note = (
                "Higher than reference range" if r.flag == "high"
                else "Lower than reference range" if r.flag == "low"
                else "Result reported as abnormal"
            )
            flagged.append(FlagItem(test_name=r.test_name, severity=sev, note=note))

    # Compact summary listing of flagged rows only: '<Test> <Value><Unit> [<Reference>] <FLAG?>'
    def _fmt(r: ParsedRowIn) -> str:
        val = str(r.value)
        unit = f" {r.unit}" if r.unit else ""
        ref = f" [{r.reference_range}]" if r.reference_range else ""
        flag = (r.flag or "").upper() if r.flag in {"high", "low", "abnormal"} else ""
        flag_str = f" {flag}" if flag else ""
        return f"{r.test_name} {val}{unit}{ref}{flag_str}".strip()

    flagged_rows = [r for r in rows_sorted if r.flag in {"high", "low", "abnormal"}]
    if flagged_rows:
        lines = [_fmt(r) for r in flagged_rows]
        summary = "\n".join(lines[:24])
    else:
        summary = "All provided values are within reference ranges."

    per_test: list[PerTestItem] = []
    for r in flagged_rows[:10]:  # only flagged tests; concise and ordered by severity
        val = r.value
        unit = f" {r.unit}" if r.unit else ""
        rr = f" (ref: {r.reference_range})" if r.reference_range else ""
        if r.flag == "high":
            interp = "Above the reference range."
        elif r.flag == "low":
            interp = "Below the reference range."
        elif r.flag == "abnormal":
            interp = "This result is reported as abnormal (e.g., positive/reactive)."
        elif r.flag == "normal":
            interp = "Within the reference range."
        else:
            interp = "This result is provided for discussion with your clinician."
        # Keep normal rows brief; avoid repeating generic advice on every line
        if r.flag == "normal":
            explanation = f"Reported value: {val}{unit}{rr}. {interp}"
        else:
            explanation = (
                f"Reported value: {val}{unit}{rr}. {interp} "
                "Review alongside symptoms, history, and current medications."
            )
        per_test.append(PerTestItem(test_name=r.test_name, explanation=explanation))

    # Dynamic next steps: tailor to flags if present, otherwise provide general guidance
    highs = [r.test_name for r in rows_sorted if r.flag == "high"]
    lows = [r.test_name for r in rows_sorted if r.flag == "low"]
    abns = [r.test_name for r in rows_sorted if r.flag == "abnormal"]

    def _join(names: list[str]) -> str:
        if not names:
            return ""
        unique = []
        seen = set()
        for n in names:
            if n not in seen:
                unique.append(n)
                seen.add(n)
        if len(unique) <= 3:
            return ", ".join(unique)
        return ", ".join(unique[:3]) + ", etc."

    steps: list[str] = []
    # Keep first item fixed to preserve contract with existing tests/clients
    steps.append("Please schedule a visit with your doctor to review these results and your overall health.")
    if highs or lows or abns:
        flagged_list = _join(highs + lows + abns)
        steps.append(f"Review flagged results together: {flagged_list}.")
        if highs:
            steps.append(f"Discuss factors that can raise {_join(highs)} and whether lifestyle changes or retesting are needed.")
        if lows:
            steps.append(f"Discuss causes of low {_join(lows)} (e.g., nutrition, absorption) and whether supplements or retesting are appropriate.")
        if abns:
            steps.append(f"Clarify what an abnormal/positive result for {_join(abns)} means and what confirmatory tests are recommended.")
        steps.append("Ask about recommended follow-up tests and timelines.")
        steps.append("Share any symptoms, medications, or recent changes that could affect results.")
    else:
        steps.append("Review these results with your clinician at your next visit.")
        steps.append("Ask which values are most important for you and how to maintain them.")
        steps.append("Share symptoms, medications, and recent changes that could affect labs.")
        steps.append("Ask if any routine monitoring is recommended and how often.")
        steps.append("Request guidance on nutrition, exercise, sleep, and other supportive habits.")

    next_steps = steps[:6]

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


async def _call_openai_chat(prompt: str, timeout_s: float) -> Tuple[str, Dict[str, Any]]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("missing_api_key")
    model = os.getenv("OPENAI_MODEL", "gpt-5")
    base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
    url = f"{base}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYS_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.6,
        "response_format": {"type": "json_object"},
    }
    # Some models (e.g., GPT‑5) expect max_completion_tokens rather than max_tokens
    if model.startswith("gpt-5"):
        max_out = int(os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "5000"))
        payload["max_completion_tokens"] = max_out
        # Optional: hint reasoning effort if supported (env overrides; default high)
        effort = os.getenv("OPENAI_REASONING_EFFORT", "high")
        payload["reasoning"] = {"effort": effort}
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage") or {}
        finish_reason = None
        try:
            finish_reason = data["choices"][0].get("finish_reason")
        except Exception:
            pass
        return content, {"usage": usage, "finish_reason": finish_reason, "status": r.status_code}


async def _call_openai_responses(prompt: str, timeout_s: float) -> Tuple[str, Dict[str, Any]]:
    """Call the Responses API (recommended for GPT‑5) with strict JSON output.

    Returns the textual JSON content emitted by the model.
    """
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("missing_api_key")
    model = os.getenv("OPENAI_MODEL", "gpt-5")
    base = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1").rstrip("/")
    url = f"{base}/responses"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "input": [
            {"role": "system", "content": SYS_PROMPT},
            {"role": "user", "content": prompt},
        ],
        # Strict JSON output
        "text": {"format": {"type": "json_object"}},
        # Reasoning knob supported by GPT‑5
        "reasoning": {"effort": os.getenv("OPENAI_REASONING_EFFORT", "high")},
        # Ensure enough budget for actual text, not just internal reasoning
        "max_output_tokens": int(os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "5000")),
        "temperature": 0.6,
    }
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    content = data.get("output_text")
    if content:
        return content
    # Fallback: try to assemble content from alternative shapes
    if "choices" in data:
        try:
            return data["choices"][0]["message"]["content"]
        except Exception:
            pass
    if "output" in data:
        try:
            return json.dumps(data["output"], ensure_ascii=False)
        except Exception:
            pass
    # Try to pull usage in Responses API shape
    usage = data.get("usage") or {}
    return json.dumps(data, ensure_ascii=False), {"usage": usage, "status": r.status_code}


async def interpret_rows(rows: list[ParsedRowIn]) -> tuple[InterpretationOut, dict[str, Any]]:
    start = time.perf_counter()
    logger = logging.getLogger("reportrx.backend")
    meta: dict[str, Any] = {"llm": "none", "attempts": 0}
    # Record model/base used for observability (no PHI)
    meta["model"] = os.getenv("OPENAI_MODEL", "gpt-5")
    meta["endpoint"] = "unknown"
    try:
        prompt = _build_user_prompt(rows)
        # Choose endpoint: use Responses API for GPT‑5, else Chat Completions
        use_responses = meta["model"].startswith("gpt-5") or os.getenv("OPENAI_USE_RESPONSES", "1") in {"1","true","True"}
        meta["llm"] = "openai"
        meta["attempts"] = 1
        meta["endpoint"] = "responses" if use_responses else "chat.completions"
        raw, call = await (_call_openai_responses(prompt, timeout_s=5.5) if use_responses else _call_openai_chat(prompt, timeout_s=4.5))
        try:
            obj = json.loads(raw)
            parsed = InterpretationOut.model_validate(obj)
            meta["ok"] = True
            if call:
                if "usage" in call:
                    meta["usage"] = call["usage"]
                if "finish_reason" in call and call["finish_reason"]:
                    meta["finish_reason"] = call["finish_reason"]
                if "status" in call:
                    meta["status"] = call["status"]
            logger.info({"event": "llm_call", "endpoint": meta.get("endpoint"), "model": meta.get("model"), "ok": True, "attempts": meta.get("attempts"), "usage": meta.get("usage", {})})
            return parsed, meta
        except (json.JSONDecodeError, ValidationError):
            # One repair attempt: ask the model to return only valid JSON
            meta["attempts"] = 2
            repair_prompt = (
                "Return the same content as strict valid JSON only. "
                "Do not include any prose or code fences."
            )
            raw2, call2 = await (_call_openai_responses(prompt + "\n\n" + repair_prompt, timeout_s=5.5) if use_responses else _call_openai_chat(prompt + "\n\n" + repair_prompt, timeout_s=4.5))
            obj2 = json.loads(raw2)
            parsed2 = InterpretationOut.model_validate(obj2)
            meta["ok"] = True
            if call2:
                if "usage" in call2:
                    meta["usage"] = call2["usage"]
                if "finish_reason" in call2 and call2["finish_reason"]:
                    meta["finish_reason"] = call2["finish_reason"]
                if "status" in call2:
                    meta["status"] = call2["status"]
            logger.info({"event": "llm_call", "endpoint": meta.get("endpoint"), "model": meta.get("model"), "ok": True, "attempts": meta.get("attempts"), "usage": meta.get("usage", {})})
            return parsed2, meta
    except httpx.HTTPStatusError as e:
        meta["ok"] = False
        meta["error"] = f"http_error:{e.response.status_code}"
    except httpx.RequestError as e:
        # network/timeout errors
        meta["ok"] = False
        etype = type(e).__name__.lower()
        meta["error"] = f"request_error:{etype}"
    except RuntimeError as e:
        meta["ok"] = False
        msg = str(e) or "runtime_error"
        meta["error"] = msg
    except Exception:
        # Fall back silently with generic error
        meta["ok"] = False
        meta["error"] = "unknown_error"

    finally:
        meta["duration_ms"] = int((time.perf_counter() - start) * 1000)

    # Fallback path with deterministic JSON
    fb = _fallback_interpretation(rows)
    logger.info({"event": "llm_call", "endpoint": meta.get("endpoint"), "model": meta.get("model"), "ok": False, "attempts": meta.get("attempts"), "error": meta.get("error")})
    return fb, meta
