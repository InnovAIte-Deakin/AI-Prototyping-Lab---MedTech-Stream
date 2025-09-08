from typing import Any

from fastapi.testclient import TestClient

from app.main import app


def sample_rows():
    return [
        {
            "test_name": "Hemoglobin",
            "value": 13.2,
            "unit": "g/dL",
            "reference_range": "12.0-15.5",
            "flag": "normal",
            "confidence": 0.8,
        },
        {
            "test_name": "LDL Cholesterol",
            "value": 210,
            "unit": "mg/dL",
            "reference_range": "≤ 200",
            "flag": "high",
            "confidence": 0.8,
        },
    ]


def validate_interpretation_payload(data: dict[str, Any]) -> None:
    assert "interpretation" in data
    interp = data["interpretation"]
    assert isinstance(interp["summary"], str) and len(interp["summary"]) > 0
    assert isinstance(interp["per_test"], list)
    assert isinstance(interp["flags"], list)
    assert isinstance(interp["next_steps"], list) and len(interp["next_steps"]) >= 1
    assert interp["next_steps"][0].startswith("Please schedule a visit with your doctor")
    assert isinstance(interp["disclaimer"], str) and len(interp["disclaimer"]) > 0


def test_interpret_valid_json_fallback(monkeypatch):
    # Ensure that if no OPENAI key is present, fallback produces valid JSON
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = TestClient(app)
    resp = client.post("/api/v1/interpret", json={"rows": sample_rows()})
    assert resp.status_code == 200
    data = resp.json()
    validate_interpretation_payload(data)


def test_interpret_repair_on_malformed(monkeypatch):
    # Force the LLM call to return malformed then ensure fallback JSON is returned
    from app.services import llm as llm_module

    async def bad_call(prompt: str, timeout_s: float) -> str:  # type: ignore
        return "not-json"

    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setattr(llm_module, "_call_openai_chat", bad_call)

    client = TestClient(app)
    resp = client.post("/api/v1/interpret", json={"rows": sample_rows()})
    assert resp.status_code == 200
    data = resp.json()
    validate_interpretation_payload(data)

    # No extra context behavior required in the simple version
