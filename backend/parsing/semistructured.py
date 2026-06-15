"""Stage 3 — Semi-structured text parsing.

Handles requirement documents that have recognizable structure in plain text:

* ID-tagged blocks   — ``REQ-001``, ``REQ_AUTO_001``, ``FR-001``, ``SWR_12`` …
* Numbered lists     — ``1.``, ``1.1``, ``2)`` …
* Bullet lists       — ``-``, ``*``, ``•`` …
* Section-based SRS  — headings followed by ``shall`` statements

The strategy is tried in order of decreasing structural strength; the first
strategy that yields enough confident requirements wins.
"""

from __future__ import annotations

import re

from . import detection
from .types import ParsedRequirement, ParserStrategy

# Requirement identifier: REQ-001, REQ_AUTO_001, FR-001, SWR_12, SYS-1.2 …
_ID_TOKEN = r"[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*[_-]\d+(?:\.\d+)*"
_ID_PREFIXES = r"REQ|FR|NFR|SRS|SYS|SWR|HWR|UC|TST|FUNC|INT|PERF|SAF|SR|HSR|FSR"

# A block starts at an ID token and runs until the next ID token / EOF.
_ID_BLOCK_RE = re.compile(
    rf"(?P<id>(?:{_ID_PREFIXES})[_-][A-Z0-9_.\-]*\d+[A-Za-z0-9]*)"
    rf"(?P<body>.*?)(?=(?:{_ID_PREFIXES})[_-][A-Z0-9_.\-]*\d+|\Z)",
    re.IGNORECASE | re.DOTALL,
)

# Numbered list item: "1. ...", "1.1 ...", "2) ..." up to the next number.
_NUMBERED_RE = re.compile(
    r"(?:^|\n)\s*(?P<num>\d+(?:\.\d+)*)[\.\)]\s+(?P<body>.+?)"
    r"(?=\n\s*\d+(?:\.\d+)*[\.\)]\s+|\Z)",
    re.DOTALL,
)

# Bullet list item.
_BULLET_RE = re.compile(r"(?:^|\n)\s*[\-\*•●▪]\s+(?P<body>.+)")

_LEADING_ID_RE = re.compile(rf"^\s*(?P<id>{_ID_TOKEN})\s*[:.)\-]?\s*", re.IGNORECASE)


def _clean(text: str) -> str:
    return " ".join(text.split()).strip()


def _split_id_and_statement(block: str) -> tuple[str | None, str | None, str]:
    """Given an ID-prefixed block, separate (id, title, statement)."""
    m = _LEADING_ID_RE.match(block)
    req_id = None
    rest = block
    if m:
        req_id = m.group("id").upper()
        rest = block[m.end():]

    lines = [ln.strip() for ln in rest.splitlines() if ln.strip()]
    # Truncate the block once an explanatory (non-normative) line begins, so a
    # trailing "Note:/Example:/Rationale" paragraph isn't glued onto the
    # requirement statement.
    kept: list[str] = []
    for ln in lines:
        low = ln.lower()
        if low.startswith(("note:", "note ", "example", "rationale", "explanation", "appendix", "figure")):
            break
        kept.append(ln)
    lines = kept
    if not lines:
        return req_id, None, ""

    # If the first line is short and the next lines carry the requirement,
    # treat the first line as a title.
    if len(lines) >= 2 and len(lines[0]) <= 80 and not detection.has_positive_indicator(lines[0]):
        title = lines[0]
        statement = _clean(" ".join(lines[1:]))
    else:
        title = None
        statement = _clean(" ".join(lines))
    return req_id, title, statement


def _from_id_blocks(text: str) -> list[ParsedRequirement]:
    out: list[ParsedRequirement] = []
    for m in _ID_BLOCK_RE.finditer(text):
        block = (m.group("id") + m.group("body"))
        req_id, title, statement = _split_id_and_statement(block)
        if not statement or len(statement) < 8:
            continue
        out.append(ParsedRequirement(
            statement=statement,
            requirement_id=req_id,
            title=title,
            source=ParserStrategy.SEMI_STRUCTURED.value,
        ))
    return out


def _from_numbered(text: str) -> list[ParsedRequirement]:
    out: list[ParsedRequirement] = []
    for m in _NUMBERED_RE.finditer(text):
        body = _clean(m.group("body"))
        if len(body) < 15:
            continue
        out.append(ParsedRequirement(
            statement=body,
            requirement_id=None,
            source=ParserStrategy.SEMI_STRUCTURED.value,
        ))
    return out


def _from_bullets(text: str) -> list[ParsedRequirement]:
    out: list[ParsedRequirement] = []
    for m in _BULLET_RE.finditer(text):
        body = _clean(m.group("body"))
        if len(body) < 15:
            continue
        out.append(ParsedRequirement(
            statement=body,
            source=ParserStrategy.SEMI_STRUCTURED.value,
        ))
    return out


def _from_sentences(text: str) -> list[ParsedRequirement]:
    """Last-resort within Stage 3: pull individual modal sentences out of
    section-based prose (SRS paragraphs)."""
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
    out: list[ParsedRequirement] = []
    for s in sentences:
        s = _clean(s)
        if len(s) < 20:
            continue
        if detection.has_positive_indicator(s):
            out.append(ParsedRequirement(
                statement=s,
                source=ParserStrategy.SEMI_STRUCTURED.value,
            ))
    return out


def parse_semistructured(text: str) -> list[ParsedRequirement]:
    """Run the strongest applicable strategy and return its requirements."""
    if not text or not text.strip():
        return []

    # 1. ID-tagged blocks (strongest signal).
    id_reqs = _from_id_blocks(text)
    if len(id_reqs) >= 2:
        return _post_filter(id_reqs)

    # 2. Numbered requirements.
    numbered = _from_numbered(text)
    numbered = [r for r in numbered if detection.is_requirement(r.statement)]
    if len(numbered) >= 2:
        return _post_filter(numbered)

    # 3. Bullet requirements.
    bullets = _from_bullets(text)
    bullets = [r for r in bullets if detection.is_requirement(r.statement)]
    if len(bullets) >= 2:
        return _post_filter(bullets)

    # 4. Section-based / free prose modal sentences.
    sentences = _from_sentences(text)
    if sentences:
        return _post_filter(sentences)

    # Salvage single ID block if that is all there is.
    return _post_filter(id_reqs)


def _post_filter(reqs: list[ParsedRequirement]) -> list[ParsedRequirement]:
    seen: set[str] = set()
    out: list[ParsedRequirement] = []
    for r in reqs:
        key = r.statement.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out
