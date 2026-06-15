"""Stage 6 — Metadata extraction.

Pure-regex / heuristic enrichment of a single requirement statement. No LLM,
no network. Everything here is deterministic so it can run on 100% of
requirements regardless of which parser produced them.
"""

from __future__ import annotations

import re

from .types import (
    CATEGORY_FUNCTIONAL,
    CATEGORY_INTERFACE,
    CATEGORY_PERFORMANCE,
    CATEGORY_SAFETY,
    CATEGORY_UNKNOWN,
)

# ── Units ────────────────────────────────────────────────────────────────
# Ordered longest-first so "km/h" matches before "h", "ms" before "s".
_UNIT_TOKENS = [
    "km/h", "m/s2", "m/s", "rad/s", "deg/s",
    "ms", "us", "ns", "Hz", "kHz", "MHz",
    "mV", "kV", "V", "mA", "A", "kW", "W", "Nm",
    "kPa", "bar", "Pa", "psi",
    "°C", "degC", "°F",
    "kg", "g", "mm", "cm", "km", "m",
    "%", "ppm", "dB",
]
_UNIT_RE = re.compile(
    r"(?<![A-Za-z])(\d+(?:\.\d+)?)\s*(" + "|".join(re.escape(u) for u in _UNIT_TOKENS) + r")(?![A-Za-z])"
)

# ── Thresholds (numeric comparisons) ─────────────────────────────────────
_THRESHOLD_RE = re.compile(
    r"\b(?:less than|greater than|at least|at most|no more than|no less than|"
    r"within|exceed(?:s|ing)?|below|above|under|over|maximum|minimum|max|min|"
    r"<=?|>=?|±|\+/-)\s*\d+(?:\.\d+)?\s*[A-Za-z%°/]*",
    re.I,
)

# ── Timing constraints ───────────────────────────────────────────────────
_TIMING_RE = re.compile(
    r"\b(?:within|every|after|before|for|each|per)\s+\d+(?:\.\d+)?\s*"
    r"(?:ms|us|ns|s|sec|seconds?|min|minutes?|h|hours?|cycles?|Hz)\b",
    re.I,
)

# ── Logical operators ────────────────────────────────────────────────────
_LOGICAL_RE = re.compile(
    r"\b(?:if|then|else|when|unless|and|or|not|while|until|otherwise|"
    r"in case of|provided that)\b",
    re.I,
)

# ── Entities ─────────────────────────────────────────────────────────────
# Automotive domain nouns + acronyms + capitalized multi-word phrases.
_DOMAIN_TERMS = (
    "ECU", "ABS", "ESP", "EPS", "BCM", "TCU", "VCU", "BMS", "ADAS",
    "CAN", "LIN", "FlexRay", "Ethernet", "MOST", "OBD",
    "sensor", "actuator", "brake", "throttle", "steering", "airbag",
    "battery", "inverter", "motor", "torque", "pedal", "diagnostic",
    "watchdog", "controller", "gateway", "transceiver", "relay",
)
_DOMAIN_RE = re.compile(r"\b(" + "|".join(_DOMAIN_TERMS) + r")\b", re.I)
_ACRONYM_RE = re.compile(r"\b([A-Z]{2,6}(?:\d+)?)\b")
_CAP_PHRASE_RE = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b")

# ── Category keyword maps ────────────────────────────────────────────────
_SAFETY_KW = ("safety", "asil", "fault", "fail-safe", "failsafe", "hazard",
              "diagnostic", "redundan", "watchdog", "emergency", "fault-tolerant")
_PERF_KW = ("performance", "latency", "throughput", "response time", "within",
            "frequency", "speed", "rate", "cycle", "ms", "millisecond")
_INTERFACE_KW = ("interface", "can", "lin", "flexray", "ethernet", "protocol",
                 "signal", "message", "bus", "communicat", "api", "port")


def _dedup_keep_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        k = it.lower()
        if k not in seen:
            seen.add(k)
            out.append(it)
    return out


def extract_units(text: str) -> list[str]:
    return _dedup_keep_order([f"{m.group(1)} {m.group(2)}" for m in _UNIT_RE.finditer(text)])


def extract_thresholds(text: str) -> list[str]:
    return _dedup_keep_order([m.group(0).strip() for m in _THRESHOLD_RE.finditer(text)])


def extract_timing(text: str) -> list[str]:
    return _dedup_keep_order([m.group(0).strip() for m in _TIMING_RE.finditer(text)])


def extract_logical_operators(text: str) -> list[str]:
    return _dedup_keep_order([m.group(0).lower() for m in _LOGICAL_RE.finditer(text)])


def extract_entities(text: str) -> list[str]:
    ents: list[str] = []
    ents += [m.group(1) for m in _DOMAIN_RE.finditer(text)]
    ents += [m.group(1) for m in _ACRONYM_RE.finditer(text)]
    ents += [m.group(1) for m in _CAP_PHRASE_RE.finditer(text)]
    # Drop obvious non-entities.
    blacklist = {"The", "This", "When", "Then", "If", "System", "REQ"}
    ents = [e for e in ents if e not in blacklist]
    return _dedup_keep_order(ents)[:12]


def classify_category(text: str, *, hint: str | None = None) -> str:
    low = text.lower()
    if hint:
        return hint
    if any(k in low for k in _SAFETY_KW):
        return CATEGORY_SAFETY
    if any(k in low for k in _INTERFACE_KW):
        return CATEGORY_INTERFACE
    if any(k in low for k in _PERF_KW):
        return CATEGORY_PERFORMANCE
    # Default: anything with a modal verb is functional.
    if "shall" in low or "must" in low or "will" in low:
        return CATEGORY_FUNCTIONAL
    return CATEGORY_UNKNOWN


def enrich(req) -> None:
    """Populate a ParsedRequirement's metadata fields in place.

    Combines the statement with description/area context where available so
    units mentioned only in a description column are still captured.
    """
    parts = [req.statement]
    if getattr(req, "description", None):
        parts.append(req.description)
    text = " ".join(p for p in parts if p)

    req.units = extract_units(text)
    req.thresholds = extract_thresholds(text)
    req.timing_constraints = extract_timing(text)
    req.logical_operators = extract_logical_operators(text)
    req.entities = extract_entities(text)
    # Prefer an explicit Requirement Area / Test Focus as the category hint.
    hint = None
    if getattr(req, "area", None):
        hint = classify_category(req.area)
        if hint == CATEGORY_UNKNOWN:
            hint = None
    req.category = classify_category(text, hint=hint)
