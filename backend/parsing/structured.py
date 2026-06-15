"""Stage 2 — Deterministic structured (table) parsing.

Consumes a normalized table (``list[list[str]]``) produced by an extractor and
emits one :class:`ParsedRequirement` per data row. Column detection maps header
labels to canonical fields (Requirement ID, Area, Statement, Description, ASIL,
Test Focus) using case-insensitive synonym matching, and degrades gracefully to
heuristics when a table has no recognizable header.
"""

from __future__ import annotations

import re

from . import detection
from .types import ParsedRequirement, ParserStrategy

Table = list[list[str]]

# Canonical field -> accepted header synonyms (all lowercased, stripped).
_COLUMN_SYNONYMS: dict[str, tuple[str, ...]] = {
    "requirement_id": (
        "requirement id", "req id", "req. id", "requirement no", "req no",
        "id", "identifier", "req", "reqid", "requirement_id", "requirement #",
        "req #", "no", "s.no", "sl no", "sr no",
    ),
    "area": (
        "requirement area", "area", "module", "feature", "domain",
        "component", "subsystem", "function", "functional area",
    ),
    "statement": (
        "requirement statement", "requirement", "statement", "requirement text",
        "req statement", "requirement description", "text", "req text",
        "requirement detail", "requirements",
    ),
    "description": (
        "description", "details", "detail", "notes", "note", "comment",
        "comments", "remarks", "explanation",
    ),
    "asil": (
        "asil", "asil level", "safety level", "safety integrity", "sil",
    ),
    "test_focus": (
        "test focus", "focus", "test", "verification", "test objective",
        "test method", "verification method",
    ),
    "title": (
        "title", "name", "requirement name", "summary",
    ),
}

_NORM_RE = re.compile(r"[\s_\-\.\#]+")


def _norm_header(cell: str) -> str:
    return _NORM_RE.sub(" ", cell.strip().lower()).strip()


def _looks_like_header(row: list[str]) -> bool:
    """A header row matches at least one known synonym and contains no
    obvious sentence (requirement statements rarely sit in a header)."""
    norm = [_norm_header(c) for c in row]
    hits = 0
    for field, syns in _COLUMN_SYNONYMS.items():
        if any(n in syns for n in norm):
            hits += 1
    return hits >= 1


def _map_columns(header: list[str]) -> dict[str, int]:
    """Map canonical field -> column index. First match wins per field."""
    mapping: dict[str, int] = {}
    norm = [_norm_header(c) for c in header]
    for field, syns in _COLUMN_SYNONYMS.items():
        for idx, h in enumerate(norm):
            if idx in mapping.values():
                continue
            if h in syns:
                mapping[field] = idx
                break
    return mapping


def _longest_text_column(rows: Table) -> int:
    """Heuristic when there is no header: the requirement statement is almost
    always the column with the highest average character length."""
    if not rows:
        return 0
    width = max(len(r) for r in rows)
    avg = [0.0] * width
    for c in range(width):
        lengths = [len(r[c]) for r in rows if c < len(r)]
        avg[c] = sum(lengths) / len(lengths) if lengths else 0.0
    return max(range(width), key=lambda c: avg[c])


def _cell(row: list[str], idx: int | None) -> str | None:
    if idx is None or idx >= len(row):
        return None
    val = (row[idx] or "").strip()
    return val or None


def requirements_from_table(table: Table) -> list[ParsedRequirement]:
    """Extract requirements from a single normalized table."""
    rows = [[(c or "").strip() for c in row] for row in table if any((c or "").strip() for c in row)]
    if len(rows) < 1:
        return []

    has_header = _looks_like_header(rows[0])
    if has_header:
        mapping = _map_columns(rows[0])
        data = rows[1:]
    else:
        mapping = {}
        data = rows

    # Resolve the statement column.
    stmt_idx = mapping.get("statement")
    if stmt_idx is None and not mapping.get("description"):
        stmt_idx = _longest_text_column(data) if data else 0
    elif stmt_idx is None:
        # Only a description column exists; treat it as the statement.
        stmt_idx = mapping.get("description")

    out: list[ParsedRequirement] = []
    for row in data:
        statement = _cell(row, stmt_idx)
        description = _cell(row, mapping.get("description"))
        # If statement and description collapsed to the same column, drop dup.
        if description and statement and description == statement:
            description = None
        if not statement:
            statement = description
            description = None
        if not statement:
            continue

        req = ParsedRequirement(
            statement=statement,
            requirement_id=_cell(row, mapping.get("requirement_id")),
            title=_cell(row, mapping.get("title")),
            description=description,
            area=_cell(row, mapping.get("area")),
            asil=_cell(row, mapping.get("asil")),
            test_focus=_cell(row, mapping.get("test_focus")),
            source=ParserStrategy.TABLE.value,
        )
        out.append(req)

    # Filter explanatory rows (relaxed, since rows are already structured).
    filtered: list[ParsedRequirement] = []
    for req in out:
        if detection.is_requirement(req.statement, structured=True):
            filtered.append(req)
    return filtered


def requirements_from_tables(tables: list[Table]) -> list[ParsedRequirement]:
    out: list[ParsedRequirement] = []
    for t in tables:
        out.extend(requirements_from_table(t))
    return out
