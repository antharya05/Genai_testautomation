"""Deterministic ASIL resolution for the generation pipeline.

Single source of truth for the ASIL (Automotive Safety Integrity Level) used
when generating test cases. Resolution is deterministic and explainable — no
LLM is involved — and it always reports WHERE the value came from:

  * ``"requirement"`` — the ASIL was stated in the document (a parsed table
    column or written inline in the text). Used verbatim, confidence 100.
  * ``"estimated"``  — the ASIL was inferred from the requirement content using
    hazard/severity keyword heuristics. Carries a 0-100 estimation confidence.

The estimated ASIL is NEVER labelled as coming from the requirement; callers
surface ``asil_source`` so downstream consumers (prompt, validation, export)
can present the two cases differently.
"""

from __future__ import annotations

import re

VALID_ASIL = {"QM", "A", "B", "C", "D"}

# ── Explicit ASIL stated in the document ─────────────────────────────────
# Matches "ASIL D", "ASIL-D", "ASIL: B", "(ASIL C)", "ASIL QM", and the
# parser's embedded tag "[ASIL D]". QM is only accepted next to the ASIL token
# to avoid matching the two-letter sequence in unrelated prose.
_EXPLICIT_RE = re.compile(r"ASIL[\s\-:_]*?(QM|[ABCD])\b", re.IGNORECASE)

# ── Estimation keyword tiers ─────────────────────────────────────────────
# Ordered most-severe first. The first tier with a keyword hit wins; the count
# of hits feeds the confidence score.
_TIERS: list[tuple[str, tuple[str, ...]]] = [
    ("D", (
        "airbag", "brake", "braking", "steering", "collision", "crash",
        "emergency", "fail-safe", "failsafe", "safe state", "safe-state",
        "unintended", "loss of control", "deploy", "occupant", "pretensioner",
        "hands-off", "autonomous", "anti-lock", "abs ", "esp ", "stability control",
    )),
    ("C", (
        "high voltage", "high-voltage", "propulsion", "traction", "powertrain",
        "torque", "battery", "inverter", "acceleration", "accelerat",
        "throttle", "isolation", "overcurrent", "thermal runaway", "hv ",
    )),
    ("B", (
        "fault", "diagnostic", "monitor", "detect", "warning lamp", "telltale",
        "watchdog", "plausibility", "sensor", "actuator", "degraded",
        "redundan", "limp", "malfunction",
    )),
    ("A", (
        "indicator", "warning", "alert", "notify", "display warning",
        "driver information", "chime",
    )),
    ("QM", (
        "infotainment", "comfort", "hvac", "climate", "lighting", "ambient",
        "convenience", "logging", "log ", "telemetry", "cosmetic", "display",
        "seat heating", "media",
    )),
]


def _normalize(asil: str | None) -> str | None:
    if not asil:
        return None
    # Tolerate the values a parser ASIL column actually carries: "ASIL D",
    # "ASIL-D", "ASIL: B", "[ASIL C]", as well as the bare "D"/"QM" form.
    a = re.sub(r"^\[?\s*ASIL[\s\-:_]*", "", asil.strip().upper()).strip().rstrip("]").strip()
    return a if a in VALID_ASIL else None


def extract_explicit_asil(text: str) -> str | None:
    """Return the ASIL explicitly stated in ``text``, or None."""
    if not text:
        return None
    m = _EXPLICIT_RE.search(text)
    if not m:
        return None
    return _normalize(m.group(1))


def estimate_asil(text: str) -> tuple[str, int]:
    """Infer an ASIL from requirement content. Returns (asil, confidence 0-100)."""
    low = (text or "").lower()
    for level, keywords in _TIERS:
        hits = [k for k in keywords if k in low]
        if hits:
            # Base confidence per matched tier, raised slightly by multiple hits.
            confidence = min(90, 55 + 10 * len(hits))
            return level, confidence
    # Nothing matched — fall back to QM with low confidence so callers know the
    # estimate is weak (not a stated value).
    return "QM", 25


def resolve_asil(text: str, parsed_asil: str | None = None) -> dict:
    """Resolve the authoritative ASIL for a requirement.

    Precedence:
      1. ``parsed_asil`` from the parser (e.g. a table ASIL column).
      2. An ASIL stated inline in the requirement text.
      3. Content-based estimation.

    Returns ``{"asil", "asil_source", "asil_confidence"}`` where ``asil_source``
    is ``"requirement"`` or ``"estimated"``.
    """
    stated = _normalize(parsed_asil) or extract_explicit_asil(text)
    if stated:
        return {"asil": stated, "asil_source": "requirement", "asil_confidence": 100}

    level, confidence = estimate_asil(text)
    return {"asil": level, "asil_source": "estimated", "asil_confidence": confidence}


# Coverage-depth expectations per ASIL (mirrors the prompt's ASIL COVERAGE
# RULES) — used by validation to flag under-coverage, never to drop cases.
ASIL_MIN_TEST_TYPES: dict[str, set[str]] = {
    "QM": {"functional"},
    "A": {"functional"},
    "B": {"functional", "negative"},
    "C": {"functional", "negative", "fault_injection"},
    "D": {"functional", "timing", "safety"},
}

ASIL_MIN_CASES: dict[str, int] = {"QM": 2, "A": 2, "B": 3, "C": 3, "D": 5}
