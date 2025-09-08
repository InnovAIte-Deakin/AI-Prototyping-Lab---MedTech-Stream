from __future__ import annotations

import re
from dataclasses import dataclass

# Precompiled regexes for performance
NUM = r"\d+(?:\.\d+)?"
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

POS_NEG = re.compile(r"\b(positive|negative|reactive|non[- ]reactive)\b", re.IGNORECASE)
END_FLAG_TAIL = re.compile(r"(?i)(?:[\[(]?\s*)(?P<flag>High|Low|H|L|↑|↓)(?:\s*[\])])?\s*$")

FIRST_NUMBER_POS = re.compile(NUM)

# Simple header/footer noise filters
NOISE = re.compile(
    r"^(page\s*\d+|confidential|laboratory report|patient:|dob:|collected:|reported:)",
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
        low = float(m.group("low"))
        high = float(m.group("high"))
        return f"{low}-{high}", (low, high), None, None
    m = PAREN_X_Y.search(segment)
    if m:
        low = float(m.group("low"))
        high = float(m.group("high"))
        return f"{low}-{high}", (low, high), None, None
    m = RANGE_X_Y.search(segment)
    if m:
        low = float(m.group("low"))
        high = float(m.group("high"))
        return f"{low}-{high}", (low, high), None, None
    m = RANGE_TO.search(segment)
    if m:
        low = float(m.group("low"))
        high = float(m.group("high"))
        return f"{low}-{high}", (low, high), None, None
    m = RANGE_LE.search(segment)
    if m:
        le = float(m.group("le"))
        return f"≤ {le}", None, le, None
    m = RANGE_ALT_LE.search(segment)
    if m:
        le = float(m.group("le"))
        return f"≤ {le}", None, le, None
    m = RANGE_GE.search(segment)
    if m:
        ge = float(m.group("ge"))
        return f"≥ {ge}", None, None, ge
    return None, None, None, None


def _compute_flag(
    value: float | str,
    range_tuple: tuple[float, float] | None,
    le: float | None,
    ge: float | None,
) -> str | None:
    # Non-numeric interpretations
    if isinstance(value, str):
        val = value.lower()
        if val in {"positive", "reactive"}:
            return "abnormal"
        if val in {"negative", "non-reactive", "non reactive"}:
            return "normal"
        return None

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
    present = 0
    total = 5  # test_name, value, unit, reference_range, flag
    if row.test_name:
        present += 1
    if row.value is not None:
        present += 1
    if row.unit:
        present += 1
    if row.reference_range:
        present += 1
    if row.flag:
        present += 1
    return min(1.0, present / total)


def parse_text(text: str) -> tuple[list[ParsedRow], list[str]]:
    rows: list[ParsedRow] = []
    unparsed: list[str] = []

    # Normalize newlines; split into lines
    for raw_line in text.splitlines():
        line = _clean_line(raw_line)
        if not line:
            continue
        if NOISE.search(line):
            continue

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
        pm = POS_NEG.search(line)
        if pm:
            value = pm.group(1).capitalize()
            split_pos = None  # ignore numeric tokens in the name split
        else:
            # Value + unit
            vm = VALUE_WITH_UNIT.search(line)
            if vm:
                try:
                    comp = (vm.group("comp") or "").strip()
                    # If a comparator is present (e.g., '<5'), preserve as string for safety
                    if comp:
                        value = f"{comp}{vm.group('val')}"
                    else:
                        value = float(vm.group("val"))
                except Exception:
                    value = vm.group("val")
                unit = vm.group("unit") or None
                # For name-splitting, prefer the start of the numeric value we captured
                split_pos = vm.start("val")

        if split_pos is not None:
            # Test name is the left part before first number
            name = line[: split_pos].strip(" -:\t")
        else:
            # No number: use part before colon as name if present
            if ":" in line:
                name = line.split(":", 1)[0].strip()

        # Explicit flag markers like 'H', 'L', '↑', '↓' appearing after the value
        explicit_flag: str | None = None
        # Only search in the tail after the numeric value/unit to avoid matching unit '/L'
        tail = ""
        try:
            if 'vm' in locals() and vm:
                tail = line[vm.end():]
        except Exception:
            tail = ""
        if tail:
            mflag = END_FLAG_TAIL.search(tail)
            if mflag:
                tok = mflag.group("flag").lower()
                if tok in {"h", "high", "↑"}:
                    explicit_flag = "high"
                elif tok in {"l", "low", "↓"}:
                    explicit_flag = "low"

        if name and value is not None:
            flag = _compute_flag(value, range_tuple, le, ge)
            if explicit_flag:
                flag = explicit_flag
            row = ParsedRow(
                test_name=name,
                value=value,
                unit=unit,
                reference_range=reference_range,
                flag=flag,
                confidence=0.0,  # fill below
            )
            row.confidence = _confidence(row)
            rows.append(row)
        else:
            # Keep unparsed lines for debugging/feedback to user
            unparsed.append(line)

    return rows, unparsed
