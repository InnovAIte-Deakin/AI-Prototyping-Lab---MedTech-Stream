from app.services.parser import parse_text


def test_b12_name_with_number_not_value():
    text = "Vitamin B12 600 pg/mL 200-900"
    rows, _ = parse_text(text)
    r = rows[0]
    assert r.test_name.lower().startswith("vitamin b12")
    assert r.value == 600.0
    assert (r.unit or "").lower() == "pg/ml"
    assert r.reference_range == "200.0-900.0"
    assert r.flag == "normal"


def test_parenthetical_and_to_ranges_and_flags():
    text = "\n".join(
        [
            "Ferritin 15 ng/mL (13-150)",
            "TSH 6.0 mIU/L 0.4 to 4.0",
            "ALT 55 U/L H",
            "CRP <5 mg/L (0-10)",
            "WBC 5.4 x10^9/L 3.5-11.0",
            "Hep B Surface Antigen: Non-reactive",
        ]
    )
    rows, _ = parse_text(text)

    ferritin = next(r for r in rows if r.test_name.lower().startswith("ferritin"))
    assert ferritin.reference_range == "13.0-150.0"
    assert ferritin.flag == "normal"

    tsh = next(r for r in rows if r.test_name.lower().startswith("tsh"))
    assert tsh.reference_range == "0.4-4.0"
    assert tsh.flag == "high"

    alt = next(r for r in rows if r.test_name.lower().startswith("alt"))
    assert alt.flag == "high"

    crp = next(r for r in rows if r.test_name.lower().startswith("crp"))
    assert isinstance(crp.value, str) and crp.value.startswith("<")
    # flag may be None when value is an inequality; do not assert flag

    wbc = next(r for r in rows if r.test_name.lower().startswith("wbc"))
    assert (wbc.unit or "").lower().startswith("x10^")
    assert wbc.reference_range == "3.5-11.0"
    assert wbc.flag == "normal"

    hbsag = next(r for r in rows if r.test_name.lower().startswith("hep b"))
    assert isinstance(hbsag.value, str) and hbsag.value.lower() == "non-reactive"
    assert hbsag.flag == "normal"

