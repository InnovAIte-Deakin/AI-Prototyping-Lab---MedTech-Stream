import io

import fitz  # PyMuPDF
from fastapi.testclient import TestClient

from app.main import app
from app.routers import parse as parse_router


def make_pdf_bytes(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    # Use a fixed position and simple font
    page.insert_text((72, 72), text)
    data = doc.tobytes()  # returns bytes of the PDF
    doc.close()
    return data


def test_parse_pdf_smoke(monkeypatch):
    async def fake_extract(_: str):
        return [
            {
                "test_name": "Hemoglobin",
                "result": "13.2",
                "unit": "g/dL",
                "reference_range": "12.0-15.5",
                "flag": None,
            },
            {
                "test_name": "LDL",
                "result": "210",
                "unit": "mg/dL",
                "reference_range": "≤ 200",
                "flag": "H",
            },
        ]

    monkeypatch.setattr(parse_router, "extract_lab_rows_with_openai", fake_extract)

    content = "Hemoglobin 13.2 g/dL 12.0-15.5\nLDL 210 mg/dL ≤ 200"
    pdf_bytes = make_pdf_bytes(content)
    client = TestClient(app)
    files = {"file": ("sample.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    resp = client.post("/api/v1/parse", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert "rows" in data and isinstance(data["rows"], list)
    assert len(data["rows"]) >= 2
    # Basic plausibility: one row should be LDL with high flag
    ldl = next((r for r in data["rows"] if r["test_name"].lower().startswith("ldl")), None)
    assert ldl is not None
    assert ldl["flag"] == "high"
