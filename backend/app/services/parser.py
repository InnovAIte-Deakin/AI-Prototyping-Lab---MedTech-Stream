from __future__ import annotations

import re
from dataclasses import dataclass

# Precompiled regexes for performance
# Number pattern supporting either plain digits, or thousands groups, with optional decimal using '.' or ','.
# Examples: "13.2", "1,234.5", "5,4", "1,234", "210"
NUM = r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:[\.,]\d+)?"
HYPHEN = r"[-–]"

RANGE_X_Y = re.compile(rf"\b(?P<low>{NUM})\s*{HYPHEN}\s*(?P<high>{NUM})\b")
# Support "to" as a range separator and ranges in parentheses
RANGE_TO = re.compile(rf"\b(?P<low>{NUM})\s*(?:to)\s*(?P<high>{NUM})\b", re.IGNORECASE)
PAREN_X_Y = re.compile(rf"\((?P<low>{NUM})\s*{HYPHEN}\s*(?P<high>{NUM})\)")
# Threshold ranges like "≤ 200" or "<=200" may be preceded by spaces or symbols,
# so avoid a leading word boundary and ensure we stop at whitespace/end.
RANGE_LE = re.compile(rf"(?:≤|<=)\s*(?P<le>{NUM})(?!\S)")
RANGE_GE = re.compile(rf"(?:≥|>=)\s*(?P<ge>{NUM})(?!\S)")
# Some PDF extractions (e.g., certain fonts) convert '≤' into a middle dot '·'.
# Treat '· N' as a conservative proxy for '≤ N'.
RANGE_ALT_LE = re.compile(rf"[·•]\s*(?P<le>{NUM})(?!\S)")
REF_RANGE = re.compile(
    rf"reference\s*(?:range|interval)[:\s]+(?P<low>{NUM})\s*{HYPHEN}\s*(?P<high>{NUM})",
    re.IGNORECASE,
)
# Alternate labels that often precede ranges
REF_ANY = re.compile(
    rf"(?:ref(?:erence)?\s*(?:range|interval)|normal\s*range|range|ref\s*:)[:\s]+"
    rf"(?P<low>{NUM})\s*{HYPHEN}\s*(?P<high>{NUM})",
    re.IGNORECASE,
)

# Units: basic common and flexible token near value
UNIT_TOKEN = (
    r"%|mg/dL|g/dL|mmol/L|ng/mL|pg/mL|mIU/L|IU/L|U/L|x?10\^\d+/[a-zA-ZμuL]+|"
    r"10\^\d+/?L|[a-zA-Zμµ%][\wμµ/^%]*"
)
# Require that numeric value is not part of a word (e.g., avoid catching the '12' in 'B12')
# Also allow optional comparator directly before the value (e.g., '<5', '≥ 3.5').
VALUE_WITH_UNIT = re.compile(
    rf"(?<![A-Za-z0-9])(?P<comp><|>|≤|≥|<=|>=)?\s*(?P<val>{NUM})\s*(?P<unit>(?:{UNIT_TOKEN}))?\b"
)

POS_NEG = re.compile(r"\b(positive|negative|reactive|non[- ]?reactive)\b", re.IGNORECASE)
END_FLAG_TAIL = re.compile(r"(?i)(?:[\[(]?\s*)(?P<flag>High|Low|H|L|↑|↓)(?:\s*[\])])?\s*$")

# Avoid matching numbers that are part of an alphanumeric token (e.g., the '12' in 'B12')
FIRST_NUMBER_POS = re.compile(rf"(?<![A-Za-z]){NUM}")

# Additional filters for obvious non-data lines
SECTION_HEADER = re.compile(
    r"^(?:comprehensive\s+metabolic\s+panel|complete\s+blood\s+count|lipid\s+panel|thyroid\s+function|vitamins|edge[-\s]*case.*parsing)\s*\(?$",
    re.IGNORECASE,
)
ONLY_COMPARATOR = re.compile(rf"^\(?\s*(?:≤|>=|≥|<=|<|>)\s*{NUM}\s*\)?\s*$")
BARE_PAREN = re.compile(r"^\(\s*\)?$")
JUNK_NAME = re.compile(r"^[\s()\[\]{}·•≤≥]+$")


def _normalize_number_str(s: str) -> str:
    s = s.strip()
    if "," in s and "." in s:
        # Treat commas as thousands separators when both present
        return s.replace(",", "")
    if "," in s and "." not in s:
        # If matches thousands grouping (e.g., 1,234 or 12,345,678), remove commas
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+", s):
            return s.replace(",", "")
        # Else assume decimal comma
        return s.replace(",", ".")
    return s


def _to_float(s: str) -> float:
    return float(_normalize_number_str(s))


def _normalize_unit(unit: str | None) -> str | None:
    if not unit:
        return None
    u = unit.replace("µ", "μ")
    lu = u.lower()
    mapping = {
        "mg/dl": "mg/dL",
        "g/dl": "g/dL",
        "ng/ml": "ng/mL",
        "pg/ml": "pg/mL",
        "miu/l": "mIU/L",
        "iu/l": "IU/L",
        "u/l": "U/L",
        "uiu/ml": "μIU/mL",
        "μiu/ml": "μIU/mL",
        "µiu/ml": "μIU/mL",
        "x10^9/l": "x10^9/L",
        "x10^3/μl": "x10^3/μL",
        "x10^3/ul": "x10^3/μL",
        "10^3/μl": "10^3/μL",
        "10^3/ul": "10^3/μL",
        "mmol/l": "mmol/L",
        "%": "%",
    }
    if lu in mapping:
        return mapping[lu]
    # No change for plain scientific units beginning with '10^'
    # Ensure uppercase L and normalized micro symbol
    u = u.replace("/l", "/L")
    return u


def _canonicalize_name(name: str | None) -> str | None:
    if not name:
        return None
    base = re.sub(r"[^A-Za-z0-9\s]+", " ", name).strip().lower()
    base = re.sub(r"\s+", " ", base)
    mapping = {
        "hba1c": "Hemoglobin A1c",
        "hemoglobin a1c": "Hemoglobin A1c",
        "alt": "ALT",
        "sgpt": "ALT",
        "ast": "AST",
        "sgot": "AST",
        "hdl": "HDL Cholesterol",
        "ldl": "LDL Cholesterol",
        "tsh": "TSH",
        "wbc": "WBC",
        "rbc": "RBC",
        "hbsag": "Hep B Surface Antigen",
        "crp": "CRP",
        "vitamin b12": "Vitamin B12",
        "haemoglobin": "Hemoglobin",
        "hemoglobin": "Hemoglobin",
        "vitamin d": "Vitamin D",
        "25 oh vitamin d": "Vitamin D (25-OH)",
    }
    if base in mapping:
        return mapping[base]
    for k, v in mapping.items():
        if base.startswith(k):
            return v
    return name

# Simple header/footer noise filters
NOISE = re.compile(
    r"^(?:"
    r"page\s*\d+|confidential|laboratory\s*report|"
    r"patient:|dob:|collected:|collection\s*time:?|reported:|report\s*summary|"
    r"results\b|comprehensive\s*laboratory\s*report|test\s*result\s*units|reference\s*range\s*flag|"
    r"metabolic\s*panel|lipid\s*profile|complete\s*blood\s*count|cbc\b|biochemistry\b|hematology\b|"
    r"method:?|analy[sz]er:?|specimen:?|clinical\s*correlation|watermark|do\s*not\s*copy|for\s*information|"
    r"note:|end\s*of\s*report|"
    r"\u2022\s|[-\u00B7\u2022]\s"
    r")",
    re.IGNORECASE,
)

# Common metadata fields we want to skip entirely if they appear as the 'test name'.
# Keep patterns specific to avoid excluding genuine assays like "Prothrombin Time".
META_NAME = re.compile(
    r"^(report\s*id|mrn|location|report\s*date|referring\s*doctor|doctor\b|physician\b|collection\s*time|collected\s*time|"
    r"reported\s*time|accession\s*no\.?|sample\s*(?:id|no\.?|type)|specimen\s*(?:id|type)|"
    r"patient\s*(?:name|id|mrn|uhid)?\b|age\b|sex\b|gender\b|lab\s*(?:no\.?|id)|barcode\b|"
    r"receipt\s*date|receipt\s*no\.?|clinic\b|department\b|ward\b|hospital\b|"
    r"method\b|analy[sz]er\b|specimen\b|comment\b|narrative\b)",
    re.IGNORECASE,
)

# Broader metadata tokens that may appear anywhere in a header-like field
ANY_META_TOKEN = re.compile(
    r"\b(mrn|patient\s*(?:name|id|mrn|uhid)|report\s*id|accession\s*(?:no\.?|number)|"
    r"location|clinic|department|ward|hospital|laboratory\s*(?:id|number)?|lab\s*(?:no\.?|id)|barcode|dob)\b",
    re.IGNORECASE,
)

BRACKETS = re.compile(r"\[[^\]]*\]")
FOOTNOTE_MARK = re.compile(r"\*+")
WHITESPACE = re.compile(r"\s+")
PIPE = re.compile(r"\|")


@dataclass
class ParsedRow:
    test_name: str
    value: float | str
    unit: str | None
    reference_range: str | None
    flag: str | None
    confidence: float
    # Optional enriched fields for UI traceability/canonicalization
    test_name_raw: str | None = None
    unit_raw: str | None = None
    comparator: str | None = None
    value_text: str | None = None
    value_num: float | None = None
    page: int | None = None
    bbox: tuple[float, float, float, float] | None = None
    raw_line: str | None = None


def _clean_line(line: str) -> str:
    # Remove bracketed notes and footnote markers; collapse spaces
    line = BRACKETS.sub(" ", line)
    line = FOOTNOTE_MARK.sub("", line)
    line = PIPE.sub(" ", line)
    line = line.strip()
    line = WHITESPACE.sub(" ", line)
    return line


def _extract_range(
    segment: str,
) -> tuple[str | None, tuple[float, float] | None, float | None, float | None]:
    # Returns (range_str, range_tuple, le, ge)
    m = REF_RANGE.search(segment) or REF_ANY.search(segment)
    if m:
        low = _to_float(m.group("low"))
        high = _to_float(m.group("high"))
        return f"{low}-{high}", (low, high), None, None
    m = PAREN_X_Y.search(segment)
    if m:
        low = _to_float(m.group("low"))
        high = _to_float(m.group("high"))
        return f"{low}-{high}", (low, high), None, None
    m = RANGE_X_Y.search(segment)
    if m:
        low = _to_float(m.group("low"))
        high = _to_float(m.group("high"))
        return f"{low}-{high}", (low, high), None, None
    m = RANGE_TO.search(segment)
    if m:
        low = _to_float(m.group("low"))
        high = _to_float(m.group("high"))
        return f"{low}-{high}", (low, high), None, None
    m = RANGE_LE.search(segment)
    if m:
        le = _to_float(m.group("le"))
        return f"≤ {le}", None, le, None
    m = RANGE_ALT_LE.search(segment)
    if m:
        le = _to_float(m.group("le"))
        return f"≤ {le}", None, le, None
    m = RANGE_GE.search(segment)
    if m:
        ge = _to_float(m.group("ge"))
        return f"≥ {ge}", None, None, ge
    return None, None, None, None


_COMP_VAL = re.compile(rf"^(?P<comp><|>|≤|≥|<=|>=)\s*(?P<val>{NUM})$")


def _compute_flag(
    value: float | str,
    range_tuple: tuple[float, float] | None,
    le: float | None,
    ge: float | None,
) -> str | None:
    # Non-numeric interpretations
    if isinstance(value, str):
        # Comparator values like "<5" or "≥ 3.5"
        m = _COMP_VAL.match(value.strip())
        if m:
            comp = m.group("comp")
            try:
                v_bound = _to_float(m.group("val"))
            except Exception:
                v_bound = None
            if v_bound is not None:
                # With a range, decide when conclusively out or clearly under the upper bound for '<'
                if range_tuple:
                    low, high = range_tuple
                    if comp in {"<", "<=", "≤"}:
                        if v_bound < low:
                            return "low"
                        if v_bound <= high:
                            return "normal"
                        return None
                    if comp in {">", ">=", "≥"}:
                        if v_bound > high:
                            return "high"
                        # Otherwise not decisive against lower bound
                        return None
                # With threshold ranges, classify if comparator clearly violates threshold
                if le is not None:
                    # e.g., result "< 5" with rule "≤ 200" is normal; 
                    # result "> 210" with rule "≤ 200" is high
                    if comp in {"<", "<=", "≤"}:
                        return "normal" if v_bound <= le else None
                    if comp in {">", ">=", "≥"}:
                        return "high" if v_bound > le else None
                if ge is not None:
                    if comp in {">", ">=", "≥"}:
                        return "normal" if v_bound >= ge else None
                    if comp in {"<", "<=", "≤"}:
                        return "low" if v_bound < ge else None
                return None

        # Pos/Neg style
        val = value.lower()
        if val in {"positive", "reactive"}:
            return "abnormal"
        if val in {"negative", "non-reactive", "non reactive", "nonreactive"}:
            return "normal"
        return None

    # Numeric comparisons
    # Numeric comparisons
    v = float(value)
    if range_tuple:
        low, high = range_tuple
        if v < low:
            return "low"
        if v > high:
            return "high"
        return "normal"
    if le is not None:
        return "normal" if v <= le else "high"
    if ge is not None:
        return "normal" if v >= ge else "low"
    return None


def _confidence(row: ParsedRow) -> float:
    # Weighted confidence: value+unit carry more weight than free-text range or flag
    score = 0.0
    if row.test_name:
        score += 0.2
    if row.value is not None:
        score += 0.4
    if row.unit:
        score += 0.2
    if row.reference_range:
        score += 0.15
    if row.flag:
        score += 0.05
    return max(0.0, min(1.0, score))


def _split_columns_raw(raw: str) -> list[str]:
    # Split on pipes first to preserve column boundaries, then on 3+ spaces
    if "|" in raw:
        parts = [p for p in raw.split("|") if p and p.strip()]
    else:
        parts = [raw]
    out: list[str] = []
    for p in parts:
        # If multiple columns separated by large gaps
        if re.search(r"\s{3,}", p):
            out.extend([s for s in re.split(r"\s{3,}", p) if s and s.strip()])
        else:
            out.append(p)
    return out


def parse_text(text: str) -> tuple[list[ParsedRow], list[str]]:
    rows: list[ParsedRow] = []
    unparsed: list[str] = []

    # Normalize newlines; split into lines
    pending_name: str | None = None
    for raw_line in text.splitlines():
        # Break tables into column cells before cleaning to keep associations
        segments = _split_columns_raw(raw_line) or [raw_line]
        for segment in segments:
            line = _clean_line(segment)
            if not line:
                continue
            if NOISE.search(line):
                continue
            # skip obvious non-data lines
            if SECTION_HEADER.match(line):
                pending_name = None
                continue
            if BARE_PAREN.match(line) or ONLY_COMPARATOR.match(line):
                unparsed.append(line)
                continue

            # Basic multi-line handling: if previous line looked like a name and this line has value, combine
            has_number = bool(FIRST_NUMBER_POS.search(line)) or bool(POS_NEG.search(line))
            if not has_number:
                # Line without numbers: may be a name/header; stash and continue to next segment
                if not META_NAME.search(line):
                    pending_name = line
                continue
            if pending_name:
                line = f"{pending_name} {line}"
                pending_name = None

            # Find first numeric group; if none, check for Positive/Negative rows with colon
            first_num_match = FIRST_NUMBER_POS.search(line)
            split_pos: int | None = first_num_match.start() if first_num_match else None
            name: str | None = None
            value: float | str | None = None
            unit: str | None = None
            reference_range: str | None = None

            # Range detection anywhere on line
            range_str, range_tuple, le, ge = _extract_range(line)
            reference_range = range_str

            # Positive/Negative detection takes precedence over numeric extraction
            # Reset per-line extraction state to avoid leaking from previous segments
            vm = None
            comp: str | None = None
            raw_val: str | None = None
            pm = POS_NEG.search(line)
            if pm:
                value = pm.group(1).capitalize()
                split_pos = None  # ignore numeric tokens in the name split
            else:
                # Value + unit
                vm = VALUE_WITH_UNIT.search(line)
                if vm:
                    try:
                        comp = (vm.group("comp") or None)
                        # Normalize number string (decimal/comma) before casting
                        raw_val = vm.group("val")
                        if comp:
                            value = f"{comp}{raw_val}"
                        else:
                            value = _to_float(raw_val)
                    except Exception:
                        value = vm.group("val")
                    unit = _normalize_unit(vm.group("unit") or None)
                    # For name-splitting, prefer the start of the numeric value we captured
                    split_pos = vm.start("val")

            if split_pos is not None:
                # Test name is the left part before first number
                name = line[: split_pos].strip(" -:\t")
                # Drop junk-only prefixes like '(' or '≤' that arise from PDF splits
                if name and JUNK_NAME.fullmatch(name):
                    name = None
            else:
                # No number: use part before colon as name if present
                if ":" in line:
                    name = line.split(":", 1)[0].strip()

            # Drop lines that are clearly metadata headers/fields
            if name and (META_NAME.search(name) or ANY_META_TOKEN.search(name)):
                # treat as noise rather than an unparsed error line
                continue

            # If the segment starts with junk-only prefix (e.g., '(') and carries only a range,
            # attach that range to the previous parsed row when possible, instead of creating a new row.
            if name is None:
                # Ignore any accidentally captured numeric value for junk-name segments
                value = None
                if reference_range and rows:
                    last = rows[-1]
                    if last.reference_range is None:
                        last.reference_range = reference_range
                        # Recompute flag for the last row with the new range constraints
                        new_flag = _compute_flag(last.value, range_tuple, le, ge)
                        if new_flag:
                            last.flag = new_flag
                        last.confidence = _confidence(last)
                        continue
                # Otherwise treat as unparsed noise for visibility
                unparsed.append(line)
                continue

            # Explicit flag markers like 'H', 'L', '↑', '↓' appearing after the value
            explicit_flag: str | None = None
            # Only search in the tail after the numeric value/unit to avoid matching unit '/L'
            tail = line[vm.end():] if vm else ""
            if tail:
                mflag = END_FLAG_TAIL.search(tail)
                if mflag:
                    tok = mflag.group("flag").lower()
                    if tok in {"h", "high", "↑"}:
                        explicit_flag = "high"
                    elif tok in {"l", "low", "↓"}:
                        explicit_flag = "low"

            # Canonicalize the test name for consistency
            name_raw = name
            name = _canonicalize_name(name)

            if name and value is not None:
                flag = _compute_flag(value, range_tuple, le, ge)
                if explicit_flag:
                    flag = explicit_flag
                # Compute enriched fields
                comp_str = comp if comp else None
                value_text = f"{comp_str}{raw_val}" if (comp_str and raw_val is not None) else str(value)
                value_num = None
                try:
                    if not comp_str and isinstance(value, (int, float)):
                        value_num = float(value)
                except Exception:
                    value_num = None
                row = ParsedRow(
                    test_name=name,
                    value=value,
                    unit=unit,
                    reference_range=reference_range,
                    flag=flag,
                    confidence=0.0,  # fill below
                    test_name_raw=name_raw,
                    unit_raw=(vm.group("unit") if vm and vm.group("unit") else None),
                    comparator=comp_str,
                    value_text=value_text,
                    value_num=value_num,
                    page=None,
                    bbox=None,
                    raw_line=line,
                )
                row.confidence = _confidence(row)
                rows.append(row)
            else:
                # Keep unparsed lines for debugging/feedback to user
                unparsed.append(line)

    return rows, unparsed
