from app.services.parser import parse_text


def test_parse_numeric_range_and_units():
    text = """
    Hemoglobin 13.2 g/dL 12.0-15.5
    LDL Cholesterol 210 mg/dL ≤ 200
    WBC 5.4 10^9/L 3.5-11.0
    COVID-19 PCR: Positive
    """.strip()

    rows, unparsed = parse_text(text)
    # Expect at least 3 rows parsed (excluding headers)
    assert len(rows) >= 3

    hgb = next(r for r in rows if r.test_name.lower().startswith("hemoglobin"))
    assert hgb.value == 13.2
    assert (hgb.unit or "").lower() == "g/dl"
    assert hgb.reference_range == "12.0-15.5"
    assert hgb.flag == "normal"
    assert 0.6 <= hgb.confidence <= 1.0

    ldl = next(r for r in rows if r.test_name.lower().startswith("ldl"))
    assert ldl.value == 210.0
    assert (ldl.unit or "").lower() == "mg/dl"
    assert ldl.reference_range.startswith("≤")
    assert ldl.flag == "high"

    wbc = next(r for r in rows if r.test_name.lower().startswith("wbc"))
    assert wbc.value == 5.4
    assert (wbc.unit or "").startswith("10^")
    assert wbc.reference_range == "3.5-11.0"
    assert wbc.flag == "normal"

    # Positive/Negative handling
    covid = next(r for r in rows if r.test_name.lower().startswith("covid"))
    assert isinstance(covid.value, str) and covid.value.lower() == "positive"
    assert covid.flag == "abnormal"


def test_confidence_scoring():
    text = "Glucose 100 mg/dL 70-99"
    rows, _ = parse_text(text)
    row = rows[0]
    # test_name, value, unit, reference_range, flag => often all present
    assert 0.8 <= row.confidence <= 1.0
