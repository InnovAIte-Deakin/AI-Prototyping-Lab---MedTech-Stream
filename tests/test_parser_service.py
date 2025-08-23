import sys
from pathlib import Path

import pytest

# Ensure the backend package is importable when tests are executed from the
# repository root or the tests directory.
sys.path.append(str(Path(__file__).resolve().parents[1]))
from backend.app.services.parser_service import parser_service


def find_test(tests, name):
    return next((t for t in tests if t.name == name), None)


def test_parse_report_text_basic():
    text = "Hemoglobin: 13.5 g/dL ref 12.0 - 16.0"
    tests = parser_service.parse_report_text(text)
    hemoglobin = find_test(tests, "Hemoglobin")
    assert hemoglobin is not None
    assert hemoglobin.value == 13.5
    assert hemoglobin.unit == "g/dL"
    assert hemoglobin.reference_range == "12.0 - 16.0"


def test_parse_report_text_missing_unit():
    text = "Glucose 95 70 - 100"
    tests = parser_service.parse_report_text(text)
    glucose = find_test(tests, "Glucose")
    assert glucose is not None
    assert glucose.value == 95.0
    assert glucose.unit == "mg/dL"
    assert glucose.reference_range == "70 - 100"


def test_parse_report_text_malformed_range():
    text = "Potassium: 4.1 mEq/L ref 3.5 to 5.0"
    tests = parser_service.parse_report_text(text)
    potassium = find_test(tests, "Potassium")
    assert potassium is None
