"""Stage 5 — Requirement detection rules.

Decides whether a candidate block of text is a genuine requirement or
explanatory prose (notes, rationale, examples, appendices). Structured table
rows and ID-tagged blocks largely bypass this gate because their structure is
already strong evidence; free-flowing text is filtered strictly.
"""

from __future__ import annotations

import re

# Strong modal indicators that a sentence imposes a requirement.
POSITIVE_INDICATORS = (
    "shall",
    "must",
    "will",
    "required to",
    "is required",
    "needs to",
    "should",  # weaker, but common in automotive SRS
)

# Words that signal explanatory / non-normative content.
NEGATIVE_INDICATORS = (
    "note:",
    "note ",
    "for example",
    "e.g.",
    "example:",
    "rationale",
    "explanation",
    "appendix",
    "table of contents",
    "figure ",
    "revision history",
    "disclaimer",
    "copyright",
)

_POS_RE = re.compile(r"\b(" + "|".join(re.escape(p) for p in POSITIVE_INDICATORS) + r")\b", re.I)


def has_positive_indicator(text: str) -> bool:
    return bool(_POS_RE.search(text))


def negative_score(text: str) -> int:
    low = text.lower()
    return sum(1 for n in NEGATIVE_INDICATORS if n in low)


def is_requirement(text: str, *, structured: bool = False) -> bool:
    """Return True if ``text`` looks like a real requirement.

    ``structured`` relaxes the gate for table rows / ID-tagged blocks that are
    already strong signals on their own.
    """
    stripped = text.strip()
    if len(stripped) < 8:
        return False

    neg = negative_score(stripped)
    pos = has_positive_indicator(stripped)

    if structured:
        # Already structured: only reject when it is clearly non-normative
        # boilerplate with no requirement modal at all.
        if neg >= 1 and not pos:
            # e.g. an "Appendix A" row or a "Note" row in a table.
            first = stripped.lower()
            if first.startswith(("note", "example", "rationale", "appendix", "figure")):
                return False
        return True

    # Free text: require a positive modal and not be dominated by negatives.
    if not pos:
        return False
    if neg >= 2:
        return False
    return True


def filter_requirements(candidates: list[str], *, structured: bool = False) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for c in candidates:
        norm = " ".join(c.split())
        key = norm.lower()
        if key in seen:
            continue
        if is_requirement(norm, structured=structured):
            seen.add(key)
            out.append(norm)
    return out
