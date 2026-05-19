
import asyncio

from fastapi.testclient import TestClient

from app.main import app


def test_translate_success(monkeypatch):
    # Stub translate_summary to return a Spanish translation
    from app.services import llm as llm_module

    async def stub_translate(text: str, *, target_language: str, language_label: str):  # type: ignore
        assert target_language == "es"
        return "Hola mundo", {"ok": True, "language": "es"}

    monkeypatch.setattr(llm_module, "translate_summary", stub_translate)

    client = TestClient(app)
    resp = client.post("/api/v1/translate", json={"text": "Hello world", "target_language": "es"})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("language") == "es"
    assert data.get("translation") == "Hola mundo"
    assert data.get("meta", {}).get("ok") is True


def test_translate_unsupported_language():
    client = TestClient(app)
    resp = client.post("/api/v1/translate", json={"text": "Hello", "target_language": "de"})
    assert resp.status_code == 400


def test_translate_missing_api_key(monkeypatch):
    from app.services import llm as llm_module

    async def stub_translate_fail(text: str, *, target_language: str, language_label: str):  # type: ignore
        return None, {
            "ok": False,
            "error": {"code": "missing_api_key", "message": "missing_api_key"},
            "language": target_language,
        }

    monkeypatch.setattr(llm_module, "translate_summary", stub_translate_fail)

    client = TestClient(app)
    resp = client.post("/api/v1/translate", json={"text": "Hello world", "target_language": "es"})
    assert resp.status_code == 503
    body = resp.json()
    assert body.get("detail") == "Translation service unavailable"
    assert body.get("meta", {}).get("language") == "es"


def test_translate_blank_text():
    client = TestClient(app)
    resp = client.post("/api/v1/translate", json={"text": "  \n\t  ", "target_language": "es"})
    assert resp.status_code == 400


def test_translate_summary_prompt_requests_structured_layman_explanation(monkeypatch):
    from app.services import llm as llm_module

    captured: dict[str, str] = {}

    async def stub_llm(prompt: str, timeout_s: float):  # type: ignore[override]
        captured["prompt"] = prompt
        return "Resumen traducido", {"usage": {"total_tokens": 12}}

    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setenv("OPENAI_USE_RESPONSES", "1")
    monkeypatch.setattr(llm_module, "_call_openai_responses", stub_llm)

    translation, meta = asyncio.run(
        llm_module.translate_summary(
            "SUMMARY: Hemoglobin is low.\nKEY POINTS:\n- This can happen for many reasons.",
            target_language="es",
            language_label="Spanish",
        )
    )

    assert translation == "Resumen traducido"
    assert meta.get("ok") is True
    prompt = captured["prompt"]
    assert "Your job is not only to translate" in prompt
    assert "easy to understand for a child, teen, or adult" in prompt
    assert "Keep this exact structure" in prompt
    assert "1. Big picture" in prompt
    assert "2. What stood out" in prompt
    assert "3. What it means in plain words" in prompt
    assert "4. What to ask your clinician" in prompt
    assert "5. Reminder" in prompt
    assert "Do not add new medical facts" in prompt

