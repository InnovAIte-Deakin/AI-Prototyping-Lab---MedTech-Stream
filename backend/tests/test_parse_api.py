from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.main import app
from app.services import parse_pipeline


def test_parse_json_body_returns_expected_contract():
    client = TestClient(app)

    response = client.post(
        "/api/v1/parse",
        json={"text": "Glucose 92 mg/dL 70-99\nALT 61 U/L 0-55"},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert list(payload.keys()) == ["rows", "unparsed_lines", "unparsed", "meta", "extracted_text"]
    assert [row["test_name"] for row in payload["rows"]] == ["Glucose", "ALT"]
    assert payload["rows"][0]["id"] == "r1"
    assert payload["rows"][1]["id"] == "r2"
    assert payload["extracted_text"].startswith("Glucose 92")


def test_parse_multiple_uploads_preserves_extracted_text_order(monkeypatch):
    client = TestClient(app)

    def fake_pdf(_: bytes, max_pages: int = 10, ocr_lang: str | None = None) -> str:
        return "Glucose 92 mg/dL 70-99"

    def fake_image(_: bytes, lang: str | None = None) -> str:
        return "ALT 61 U/L 0-55"

    monkeypatch.setattr(parse_pipeline, "extract_text_from_pdf_bytes", fake_pdf)
    monkeypatch.setattr(parse_pipeline, "extract_text_from_image_bytes", fake_image)

    files = [
        ("files", ("report.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")),
        ("files", ("scan.png", io.BytesIO(b"png"), "image/png")),
    ]

    response = client.post("/api/v1/parse", files=files)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["extracted_text"] == "Glucose 92 mg/dL 70-99\nALT 61 U/L 0-55"
    assert [row["test_name"] for row in payload["rows"]] == ["Glucose", "ALT"]
