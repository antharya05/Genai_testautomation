"""Stage 7 — Confidence scoring.

Produces a 0-100 confidence for a set of deterministically-parsed requirements
and a list of human-readable issues. The pipeline uses this score to decide
whether the deterministic result is trustworthy or whether the LLM fallback
(Stage 8) should run.

Scoring favors strong structure (explicit IDs / table provenance), clear modal
indicators, and a sane requirement count, while penalizing sparse or noisy
output.
"""

from __future__ import annotations

from . import detection
from .types import ParsedRequirement, ParserStrategy

# Per-requirement confidence is also stamped onto each ParsedRequirement so the
# UI can flag weak individual rows.


def score_requirement(req: ParsedRequirement) -> int:
    score = 40
    if req.source == ParserStrategy.TABLE.value:
        score += 25
    elif req.source == ParserStrategy.SEMI_STRUCTURED.value:
        score += 15
    if req.requirement_id:
        score += 15
    if detection.has_positive_indicator(req.statement):
        score += 15
    else:
        score -= 10
    # Reasonable length window.
    n = len(req.statement)
    if 20 <= n <= 400:
        score += 10
    elif n < 12 or n > 1200:
        score -= 15
    if req.entities or req.thresholds or req.timing_constraints:
        score += 5
    return max(0, min(100, score))


def score_result(
    requirements: list[ParsedRequirement],
    *,
    parser_used: str,
    document_type: str,
) -> tuple[int, list[str]]:
    issues: list[str] = []

    if not requirements:
        return 0, ["No requirements were extracted deterministically."]

    # Stamp per-requirement confidence.
    per = []
    for r in requirements:
        c = score_requirement(r)
        r.confidence = c
        per.append(c)

    avg = sum(per) / len(per)

    # Aggregate adjustments.
    modal_ratio = sum(1 for r in requirements if detection.has_positive_indicator(r.statement)) / len(requirements)
    if modal_ratio < 0.4:
        issues.append(f"Only {modal_ratio:.0%} of extracted items contain a requirement modal (shall/must/will).")
    id_ratio = sum(1 for r in requirements if r.requirement_id) / len(requirements)

    count = len(requirements)
    if count == 1:
        issues.append("Only one requirement was extracted; structure may be weak.")
    if count > 500:
        issues.append("Unusually high requirement count; output may include noise.")

    confidence = avg
    if parser_used == ParserStrategy.TABLE.value and id_ratio >= 0.5:
        confidence = min(100, confidence + 10)
    if parser_used == ParserStrategy.PDF_TEXT.value:
        confidence = max(0, confidence - 5)

    confidence = int(max(0, min(100, confidence)))

    low = [i for i, c in enumerate(per) if c < 40]
    if low:
        issues.append(f"{len(low)} requirement(s) scored low individually and may be explanatory text.")

    return confidence, issues
