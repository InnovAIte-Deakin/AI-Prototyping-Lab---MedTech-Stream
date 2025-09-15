import io
import shutil

import pytest
from fastapi.testclient import TestClient

from app.main import app

_skip_reason: str | None = None
if shutil.which("tesseract") is None:
    _skip_reason = "tesseract not available"
else:
    try:
        import pytesseract  # type: ignore

        _ = pytesseract.get_tesseract_version()
    except Exception:
        _skip_reason = "pytesseract not functional"

pytestmark = pytest.mark.skipif(_skip_reason is not None, reason=_skip_reason or "skip")


def make_png_bytes(text: str) -> bytes:
    try:
        from PIL import Image, ImageDraw
    except Exception:
        pytest.skip("Pillow not available")
    img = Image.new("RGB", (800, 200), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((10, 80), text, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_ocr_image_parse_smoke():
    content = "Hemoglobin 13.2 g/dL 12.0-15.5"
    img_bytes = make_png_bytes(content)
    client = TestClient(app)
    files = {"file": ("img.png", io.BytesIO(img_bytes), "image/png")}
    resp = client.post("/api/v1/parse", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert "rows" in data
    # Allow OCR variability: just assert at least one row parsed
    assert isinstance(data["rows"], list) and len(data["rows"]) >= 1
