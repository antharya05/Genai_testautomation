"""PDF extractor (Stage 4).

Strategy:
* Prefer **pdfplumber** for both table extraction and layout-aware text. It
  handles multi-column and table-based PDFs far better than naive concatenation.
* Fall back to **PyMuPDF (fitz)** when pdfplumber is not installed or fails on a
  given file — fitz is always available in this project.

Post-processing removes running headers / footers / page numbers and merges
requirements that were split across a page boundary.
"""

from __future__ import annotations

import re

from . import ExtractedContent, Table

_PAGE_NUM_RE = re.compile(
    r"^\s*(?:page\s+)?\d+\s*(?:/|of)?\s*\d*\s*$|^\s*[-–—]\s*\d+\s*[-–—]\s*$",
    re.IGNORECASE,
)
# Normalize a line for cross-page frequency comparison (digits -> #).
_DIGIT_RE = re.compile(r"\d+")

# Fraction of pages a line must appear in (in header/footer zone) to be
# considered boilerplate.
_REPEAT_THRESHOLD = 0.4
_ZONE = 3  # number of lines at top/bottom treated as header/footer zone


def extract(path: str) -> ExtractedContent:
    pages, tables, issues = _extract_pdfplumber(path)
    if pages is None:
        pages, more = _extract_pymupdf(path)
        issues.extend(more)

    cleaned = _strip_headers_footers(pages)
    text = _merge_pages(cleaned)
    return ExtractedContent(text=text, tables=tables, issues=issues)


# ── Backends ─────────────────────────────────────────────────────────────

def _extract_pdfplumber(path: str):
    """Return (pages, tables, issues) or (None, [], issues) if unavailable."""
    try:
        import pdfplumber  # type: ignore[import]
    except ImportError:
        return None, [], ["pdfplumber not installed; using PyMuPDF fallback."]

    pages: list[str] = []
    tables: list[Table] = []
    issues: list[str] = []
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                for raw in (page.extract_tables() or []):
                    norm = _normalize_table(raw)
                    if norm:
                        tables.append(norm)
                pages.append(page.extract_text() or "")
    except Exception as exc:  # corrupt / encrypted -> fall back
        return None, [], [f"pdfplumber failed ({exc}); using PyMuPDF fallback."]
    return pages, tables, issues


def _extract_pymupdf(path: str):
    import fitz

    pages: list[str] = []
    issues: list[str] = []
    try:
        doc = fitz.open(path)
        for page in doc:
            # "blocks" sort gives better multi-column ordering than raw text.
            pages.append(page.get_text("text"))
        doc.close()
    except Exception as exc:
        issues.append(f"PyMuPDF extraction error: {exc}")
    return pages, issues


def _normalize_table(raw) -> Table:
    out: Table = []
    for row in raw:
        cells = ["" if c is None else str(c).replace("\n", " ").strip() for c in row]
        if any(cells):
            out.append(cells)
    return out


# ── Header / footer / page-number removal ────────────────────────────────

def _norm_line(line: str) -> str:
    return _DIGIT_RE.sub("#", " ".join(line.split())).strip().lower()


def _strip_headers_footers(pages: list[str]) -> list[str]:
    if len(pages) <= 1:
        return [_drop_page_numbers(p) for p in pages]

    # Tally normalized lines that appear in the header/footer zone of each page.
    from collections import Counter

    zone_counts: Counter[str] = Counter()
    for page in pages:
        lines = [ln for ln in page.splitlines() if ln.strip()]
        zone = lines[:_ZONE] + lines[-_ZONE:]
        for ln in set(_norm_line(x) for x in zone):
            if ln:
                zone_counts[ln] += 1

    threshold = max(2, int(len(pages) * _REPEAT_THRESHOLD))
    boilerplate = {ln for ln, c in zone_counts.items() if c >= threshold}

    cleaned: list[str] = []
    for page in pages:
        kept = []
        for ln in page.splitlines():
            if not ln.strip():
                kept.append(ln)
                continue
            if _PAGE_NUM_RE.match(ln):
                continue
            if _norm_line(ln) in boilerplate:
                continue
            kept.append(ln)
        cleaned.append("\n".join(kept))
    return cleaned


def _drop_page_numbers(page: str) -> str:
    return "\n".join(ln for ln in page.splitlines() if not _PAGE_NUM_RE.match(ln))


# ── Cross-page merge ─────────────────────────────────────────────────────

def _merge_pages(pages: list[str]) -> str:
    """Join pages, stitching a requirement that was split across the boundary.

    If a page ends without terminal punctuation and the next page begins with a
    lowercase letter (or a continuation word), the boundary newline is replaced
    by a space so the sentence is reunited.
    """
    if not pages:
        return ""

    merged = pages[0].rstrip()
    for nxt in pages[1:]:
        nxt = nxt.lstrip("\n")
        prev_tail = merged.rstrip()
        next_head = nxt.lstrip()
        if not next_head:
            continue
        ends_mid = prev_tail and prev_tail[-1] not in ".!?:;)]"
        starts_lower = next_head[0].islower()
        if ends_mid and starts_lower:
            merged = prev_tail + " " + next_head
        else:
            merged = prev_tail + "\n" + next_head
    return merged
