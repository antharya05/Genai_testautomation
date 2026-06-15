"""Stage 6.5 — Requirement quality scoring.

Deterministic, LLM-free assessment of how well a single requirement is written.
It runs *after* metadata enrichment (Stage 6) so it can REUSE the metadata the
pipeline already extracted — thresholds, units, timing_constraints,
logical_operators, category, entities — rather than re-deriving any of it. The
only fresh text analysis it does is for properties that are NOT part of the
metadata set (ambiguous wording, trigger/modal presence, internal contradictions).

Output shape (attached to each ``ParsedRequirement.quality``):

    {
        "quality_score": 0-100,
        "quality_level": "Poor" | "Fair" | "Good" | "Excellent",
        "issues":    [...],   # serious problems — large deductions
        "warnings":  [...],   # minor problems — small deductions
        "strengths": [...],   # positive observations — no deduction
    }

Nothing here touches generation, prompts, the database, or the frontend — it is
a pure, additive read over the parsed requirement.
"""

from __future__ import annotations

import re

from .types import CATEGORY_PERFORMANCE, CATEGORY_SAFETY

# ── 1. Clarity / Testability — ambiguous, non-measurable wording ──────────
# The canonical list from the spec, plus a few unambiguously vague synonyms.
AMBIGUOUS_TERMS: tuple[str, ...] = (
    "quickly", "safely", "appropriately", "efficiently", "optimal",
    "sufficient", "reasonable", "adequate", "user-friendly",
    # Common additional vague/subjective qualifiers seen in automotive SRS.
    "fast", "slow", "robust", "flexible", "minimal", "maximal",
    "as needed", "if necessary", "etc",
)
_AMBIGUOUS_RE = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in AMBIGUOUS_TERMS) + r")\b", re.I
)

# Normative ("expected behavior") verbs.
_MODAL_RE = re.compile(r"\b(shall|must|will|should|is required to)\b", re.I)
_NEGATED_MODAL_RE = re.compile(r"\b(shall|must|will|should)\s+not\b", re.I)

# Trigger / precondition markers.
_TRIGGER_RE = re.compile(
    r"\b(when|whenever|if|upon|once|during|after|before|while|on|as soon as|"
    r"in case of|in the event of|provided that)\b",
    re.I,
)

# Words that imply a limit/threshold should be present.
_LIMIT_IMPLIED_RE = re.compile(
    r"\b(limit|maximum|minimum|max|min|range|threshold|within|at least|"
    r"at most|no more than|no less than|exceed|below|above|up to)\b",
    re.I,
)

# ── Scoring weights ───────────────────────────────────────────────────────
_W_AMBIGUOUS = 12          # per ambiguous term (issue), capped
_W_AMBIGUOUS_CAP = 36
_W_NOT_MEASURABLE = 25     # issue
_W_NO_BEHAVIOR = 10        # issue (no normative verb)
_W_NO_TRIGGER = 8          # issue
_W_NO_TIMING = 8           # warning (issue when perf/safety)
_W_NO_UNITS = 6            # warning
_W_LIMIT_NO_THRESHOLD = 6  # warning
_W_DUP_THRESHOLD = 4       # warning
_W_CONTRADICTION = 15      # issue
_W_CONFLICT_LOGICAL = 5    # warning
_W_TOO_BRIEF = 8           # issue
_W_TESTABILITY = 8         # issue (ambiguous AND not measurable)


def _level(score: int) -> str:
    if score >= 90:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 50:
        return "Fair"
    return "Poor"


def _norm_threshold(t: str) -> str:
    return re.sub(r"\s+", "", str(t).lower())


def assess(req) -> dict:
    """Score one requirement. ``req`` is a ParsedRequirement (or any object/dict
    exposing the same fields). Reuses enriched metadata; does not re-parse it."""
    get = (lambda k, d=None: req.get(k, d)) if isinstance(req, dict) else (lambda k, d=None: getattr(req, k, d))

    statement = (get("statement") or "").strip()
    description = (get("description") or "").strip()
    text = (statement + " " + description).strip()

    # Reused parser metadata (authoritative — never re-derived here).
    thresholds = list(get("thresholds") or [])
    units = list(get("units") or [])
    timing = list(get("timing_constraints") or [])
    logical = [str(o).lower() for o in (get("logical_operators") or [])]
    entities = list(get("entities") or [])
    category = (get("category") or "").strip().lower()

    issues: list[str] = []
    warnings: list[str] = []
    strengths: list[str] = []
    score = 100

    word_count = len(re.findall(r"[A-Za-z0-9']+", statement))
    has_number = bool(re.search(r"\d", text))
    measurable = bool(thresholds or units or timing)

    # ── 1 & 4. Clarity / Testability — ambiguous wording ──────────────────
    found_ambiguous = []
    seen = set()
    for m in _AMBIGUOUS_RE.finditer(text):
        term = m.group(1).lower()
        if term not in seen:
            seen.add(term)
            found_ambiguous.append(term)
    if found_ambiguous:
        issues.append(
            "Ambiguous/subjective term(s) reduce testability: "
            + ", ".join(f'"{t}"' for t in found_ambiguous)
        )
        score -= min(_W_AMBIGUOUS_CAP, _W_AMBIGUOUS * len(found_ambiguous))
        if not measurable:
            issues.append("Vague language with no measurable criterion — hard to validate")
            score -= _W_TESTABILITY

    # ── 2. Measurability ──────────────────────────────────────────────────
    if not measurable:
        issues.append("Behavior is not measurable (no threshold, limit, or timing constraint)")
        score -= _W_NOT_MEASURABLE
    else:
        if thresholds:
            strengths.append(f"Contains measurable threshold(s): {', '.join(map(str, thresholds))}")
        if timing:
            strengths.append(f"Specifies timing constraint(s): {', '.join(map(str, timing))}")
        if units and not thresholds:
            strengths.append(f"Includes measurable unit(s): {', '.join(map(str, units))}")

    # Numeric value present but no unit captured.
    if has_number and not units and not timing:
        warnings.append("Numeric value present without an associated unit")
        score -= _W_NO_UNITS

    # A limit is implied in the wording but no threshold was extracted.
    if _LIMIT_IMPLIED_RE.search(text) and not thresholds:
        warnings.append("Wording implies a limit/threshold but no concrete value is given")
        score -= _W_LIMIT_NO_THRESHOLD

    # ── 3. Completeness ───────────────────────────────────────────────────
    has_behavior = bool(_MODAL_RE.search(text))
    if has_behavior:
        strengths.append("Uses a normative verb (shall/must/will) stating expected behavior")
    else:
        issues.append("No clear expected behavior (missing normative verb such as 'shall')")
        score -= _W_NO_BEHAVIOR

    has_trigger = bool(_TRIGGER_RE.search(text)) or any(
        o in {"if", "when", "unless", "while", "until"} for o in logical
    )
    if has_trigger:
        strengths.append("States a trigger/precondition")
    else:
        issues.append("No trigger condition specified (when/if the behavior applies)")
        score -= _W_NO_TRIGGER

    if not timing:
        timing_sensitive = category in (CATEGORY_PERFORMANCE, CATEGORY_SAFETY)
        msg = "No timing constraint specified"
        if timing_sensitive:
            issues.append(msg + f" (expected for {category} requirements)")
        else:
            warnings.append(msg)
        score -= _W_NO_TIMING

    if entities:
        strengths.append(f"References concrete entities/signals: {', '.join(entities[:5])}")

    # ── 5. Consistency ────────────────────────────────────────────────────
    # Duplicate thresholds.
    norm_thresholds = [_norm_threshold(t) for t in thresholds]
    if len(norm_thresholds) != len(set(norm_thresholds)):
        warnings.append("Duplicate threshold value(s) detected")
        score -= _W_DUP_THRESHOLD

    # Contradictory phrasing within a single requirement.
    low = text.lower()
    contradiction = None
    if _NEGATED_MODAL_RE.search(text) and re.search(r"\b(shall|must|will)\s+(?!not\b)\w", low):
        contradiction = "both an obligation and a prohibition (shall / shall not)"
    elif "always" in low and "never" in low:
        contradiction = "uses both 'always' and 'never'"
    elif re.search(r"\benabl", low) and re.search(r"\bdisabl", low):
        contradiction = "both enable and disable the same behavior"
    if contradiction:
        issues.append(f"Possible contradictory conditions — {contradiction}")
        score -= _W_CONTRADICTION

    # Conflicting logical operators (mixing AND/OR with NOT in one statement).
    distinct_logical = {o for o in logical if o in {"and", "or", "not"}}
    if {"and", "or", "not"}.issubset(distinct_logical):
        warnings.append("Mixed logical operators (and/or/not) may be ambiguous — consider splitting")
        score -= _W_CONFLICT_LOGICAL

    # ── Brevity guard ─────────────────────────────────────────────────────
    if word_count and word_count < 5:
        issues.append("Requirement is too brief to be independently testable")
        score -= _W_TOO_BRIEF

    score = max(0, min(100, score))
    return {
        "quality_score": score,
        "quality_level": _level(score),
        "issues": issues,
        "warnings": warnings,
        "strengths": strengths,
    }
