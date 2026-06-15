"""
Deterministic requirement metadata extraction.

Runs BEFORE the LLM generation call. Pulls hard facts out of the raw
requirement text — requirement id, numeric thresholds, timing constraints,
units, comparison/logical operators, and named entities (signals, CAN IDs,
components). These facts are:

  1. Injected into the generation prompt as an authoritative "allowed values"
     whitelist (see ``format_metadata_block``), so the LLM is constrained to
     real numbers from the requirement and cannot invent timings, voltages,
     CAN IDs, or sensor specs.
  2. Used by the post-generation coverage validator (``validator.validate_coverage``)
     to check boundary coverage and flag hallucinated values.

No LLM is used here — extraction is pure regex, so it is free, fast, and
itself incapable of hallucinating.
"""

import re

# ── Requirement ID ────────────────────────────────────────────────────────
# REQ_001, FR-12, SRS_4.2, NFR-007a, etc. Kept in sync with parser.py prefixes.
REQ_ID_RE = re.compile(
    r"\b((?:REQ|FR|SRS|UC|SWR|HWR|SYS|TST|FUNC|INT|NFR)[-_]?\d+[A-Za-z0-9.\-_]*)",
    re.IGNORECASE,
)

# ── Numeric value + unit ──────────────────────────────────────────────────
# Unit alternatives are ordered longest-first so 'ms' wins over 's', 'kHz'
# over 'Hz', etc. \b on the value side is avoided because units like 'km/h'
# and '%' are not word characters.
_UNIT_PATTERN = (
    r"(?:µs|us|ns|ms|sec(?:onds?)?|secs?|s|min(?:utes?)?|mins?|hrs?|h"
    r"|GHz|MHz|kHz|Hz|kV|mV|V|mA|µA|uA|A|km/h|kph|mph|m/s|rpm"
    r"|°C|℃|kPa|hPa|Pa|bar|Nm|N|kbps|Mbps|Gbps|bps|dB|Ω|ohm"
    r"|bits?|bytes?|kg|mm|cm|%)"
)
VALUE_UNIT_RE = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*(" + _UNIT_PATTERN + r")")

# Hex / CAN identifiers (e.g. 0x18FF50E5). These must never be invented.
_HEX_RE = re.compile(r"0x[0-9A-Fa-f]+")

# Time / frequency units → used to classify a value as a timing constraint.
_TIME_UNITS = {
    "µs", "us", "ns", "ms", "s", "sec", "secs", "second", "seconds",
    "min", "mins", "minute", "minutes", "h", "hr", "hrs",
    "hz", "khz", "mhz", "ghz", "rpm",
}

# ── Comparison / logical operators ────────────────────────────────────────
# Ordered so the two-sided operators (>=, <=) are matched before the strict
# (>, <) variants that are substrings of their English phrasings.
_OPERATOR_PATTERNS = [
    (r"greater than or equal to|at least|no less than|not less than|minimum of|>=|≥", ">="),
    (r"less than or equal to|at most|no more than|not (?:to )?exceed(?:ing)?|maximum of|up to|within|<=|≤", "<="),
    (r"greater than|more than|exceeds?|higher than|above|over|>", ">"),
    (r"less than|fewer than|lower than|below|under|<", "<"),
    (r"equal to|equals?|exactly|==|=", "="),
]
_OPERATOR_COMPILED = [(re.compile(p, re.IGNORECASE), sym) for p, sym in _OPERATOR_PATTERNS]

# Window (chars) to look back from a number for an associated operator phrase.
_OPERATOR_LOOKBACK = 48

_LOGICAL_RE = re.compile(r"\b(AND|OR|NOT|XOR|NAND|NOR)\b")

# Entity heuristics: hex ids, acronyms (ECU/CAN/CRC…), SNAKE_CASE signal names,
# and explicitly quoted identifiers.
_ACRONYM_RE = re.compile(r"\b[A-Z][A-Z0-9]{1,}\b")
_SNAKE_RE = re.compile(r"\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b")
_QUOTED_RE = re.compile(r"[\"']([^\"']{2,40})[\"']")

# Acronyms that are units or generic words, not entities worth listing.
_ACRONYM_STOPWORDS = {"THE", "AND", "OR", "NOT", "SHALL", "MUST", "ID", "OK"}


def extract_requirement_id(text: str) -> str:
    """Return the first requirement id found, normalised, or 'REQ_UNKNOWN'."""
    m = REQ_ID_RE.search(text or "")
    if not m:
        return "REQ_UNKNOWN"
    return m.group(1).strip().rstrip(".:,)").upper()


def _is_time_unit(unit: str) -> bool:
    return unit.lower() in _TIME_UNITS


def _nearest_operator(text: str, start: int) -> str:
    """Find the comparison operator governing the number at ``start``, if any."""
    window = text[max(0, start - _OPERATOR_LOOKBACK):start]
    best_sym, best_pos = "", -1
    for rx, sym in _OPERATOR_COMPILED:
        for m in rx.finditer(window):
            # Closest (right-most) operator before the number wins.
            if m.start() > best_pos:
                best_pos, best_sym = m.start(), sym
    return best_sym


def _extract_value_units(text: str) -> list[dict]:
    out: list[dict] = []
    for m in VALUE_UNIT_RE.finditer(text):
        num, unit = m.group(1), m.group(2)
        out.append({
            "raw": f"{num}{unit}",
            "value": float(num),
            "unit": unit,
            "start": m.start(),
        })
    return out


def _ordered_unique(items) -> list:
    seen, out = set(), []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out


def _extract_operators(text: str) -> list[str]:
    found = []
    for rx, sym in _OPERATOR_COMPILED:
        if rx.search(text):
            found.append(sym)
    return _ordered_unique(found)


def _extract_logical_operators(text: str) -> list[str]:
    return _ordered_unique(m.group(1).upper() for m in _LOGICAL_RE.finditer(text))


def _extract_entities(text: str) -> list[str]:
    entities: list[str] = []
    entities.extend(_HEX_RE.findall(text))
    entities.extend(m.group(1) for m in _QUOTED_RE.finditer(text))
    entities.extend(_SNAKE_RE.findall(text))
    for ac in _ACRONYM_RE.findall(text):
        if ac not in _ACRONYM_STOPWORDS:
            entities.append(ac)
    # Drop the requirement id itself — it is reported separately.
    cleaned = (
        e.strip() for e in entities
        if e.strip() and not REQ_ID_RE.fullmatch(e.strip())
    )
    return _ordered_unique(cleaned)[:20]


def numeric_tokens(text: str) -> set[str]:
    """
    Normalised set of {value+unit} and hex tokens in ``text``.

    Used to compare generated text against the requirement's allowed values.
    '150 ms', '150ms', '150MS' all normalise to '150ms'.
    """
    toks: set[str] = set()
    for m in VALUE_UNIT_RE.finditer(text or ""):
        toks.add((m.group(1) + m.group(2)).lower().replace(" ", ""))
    for m in _HEX_RE.finditer(text or ""):
        toks.add(m.group(0).lower())
    return toks


def extract_metadata(text: str) -> dict:
    """
    Extract the full deterministic fact set for one requirement.

    Returns a dict with: requirement_id, values (list of {raw,value,unit,start}),
    thresholds (values annotated with their comparison operator), timings,
    units, operators, logical_operators, entities, and numeric_tokens (the
    normalised allowed-value whitelist).
    """
    text = text or ""
    values = _extract_value_units(text)
    thresholds = [
        {"raw": v["raw"], "value": v["value"], "unit": v["unit"],
         "operator": _nearest_operator(text, v["start"])}
        for v in values
    ]
    return {
        "requirement_id": extract_requirement_id(text),
        "values": values,
        "thresholds": thresholds,
        "timings": [v for v in values if _is_time_unit(v["unit"])],
        "units": _ordered_unique(v["unit"] for v in values),
        "operators": _extract_operators(text),
        "logical_operators": _extract_logical_operators(text),
        "entities": _extract_entities(text),
        "numeric_tokens": numeric_tokens(text),
    }


def format_metadata_block(meta: dict) -> str:
    """
    Render the extracted facts as an authoritative prompt preamble that
    constrains the LLM to real values and drives boundary coverage.
    """
    lines = ["EXTRACTED REQUIREMENT FACTS — authoritative. Use ONLY these values."]
    lines.append(f"- Requirement ID: {meta['requirement_id']} "
                 f"(every generated test case MUST carry this exact requirement_id)")

    if meta["values"]:
        vals = ", ".join(v["raw"] for v in meta["values"])
        lines.append(f"- Numeric values present in the requirement: {vals}")
        lines.append("  → Do NOT introduce any timing, voltage, current, speed, frequency, "
                     "or other numeric value that is not in this list. If you need a value "
                     "the requirement does not state, describe it qualitatively instead.")
    else:
        lines.append("- Numeric values present in the requirement: NONE")
        lines.append("  → The requirement states no explicit numbers. Do NOT invent any "
                     "timings, voltages, currents, CAN IDs, or thresholds.")

    threshold_lines = [
        f"    • {t['operator'] + ' ' if t['operator'] else ''}{t['raw']}"
        for t in meta["thresholds"] if t["unit"]
    ]
    if threshold_lines:
        lines.append("- Thresholds detected:")
        lines.extend(threshold_lines)
        lines.append("  → For EACH numeric threshold, generate boundary test cases that "
                     "exercise BELOW, AT, and ABOVE the threshold value, and set the "
                     "\"boundary_position\" field to \"below\", \"at\", or \"above\" "
                     "accordingly. Use the threshold value itself for the AT case.")

    if meta["entities"]:
        lines.append(f"- Named entities/signals (reference only those listed; do not invent "
                     f"signals or CAN IDs): {', '.join(meta['entities'])}")

    return "\n".join(lines)
