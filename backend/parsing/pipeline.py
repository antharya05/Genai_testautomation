"""Pipeline orchestrator.

Wires the stages together:

  Stage 1 detect → Stage 2/3/4 extract+parse → Stage 5 detect requirements
  (applied inside parsers) → Stage 6 metadata → Stage 7 confidence →
  Stage 8 LLM fallback (only when needed).

Deterministic parsing is always attempted first. The LLM fallback runs only
when the deterministic result is empty, low-confidence, or the document type is
unknown — which is what keeps the great majority of automotive requirements off
the LLM path.
"""

from __future__ import annotations

import logging

from . import confidence, metadata, quality, semistructured, structured
from .detect import detect_document_type
from .extractors import (
    ExtractedContent,
    docx_extractor,
    markdown_extractor,
    pdf_extractor,
    spreadsheet,
    text_extractor,
)
from .types import DocumentType, ParsedRequirement, ParseResult, ParserStrategy

logger = logging.getLogger(__name__)

# Below this deterministic confidence we trigger the LLM fallback.
DEFAULT_LLM_THRESHOLD = 60
# Minimum deterministic requirements before we even consider the result usable.
MIN_DETERMINISTIC = 2


def parse_document(
    path: str,
    *,
    filename: str | None = None,
    provider=None,
    allow_llm: bool = True,
    llm_threshold: int = DEFAULT_LLM_THRESHOLD,
) -> ParseResult:
    """Full pipeline over a file on disk."""
    doc_type = detect_document_type(path, filename)
    content, extract_issues = _extract(doc_type, path)
    return _run_stages(
        content,
        doc_type=doc_type,
        provider=provider,
        allow_llm=allow_llm,
        llm_threshold=llm_threshold,
        extra_issues=extract_issues,
    )


def parse_text(
    text: str,
    *,
    provider=None,
    allow_llm: bool = True,
    llm_threshold: int = DEFAULT_LLM_THRESHOLD,
) -> ParseResult:
    """Full pipeline over raw text (pasted input). Markdown tables in the text
    are still recovered."""
    content = markdown_extractor.extract_from_text(text or "")
    return _run_stages(
        content,
        doc_type=DocumentType.MARKDOWN if content.tables else DocumentType.TXT,
        provider=provider,
        allow_llm=allow_llm,
        llm_threshold=llm_threshold,
        extra_issues=[],
    )


# ── Stage 1/2/4 extraction routing ───────────────────────────────────────

def _extract(doc_type: DocumentType, path: str) -> tuple[ExtractedContent, list[str]]:
    try:
        if doc_type is DocumentType.DOCX:
            c = docx_extractor.extract(path)
        elif doc_type is DocumentType.PDF:
            c = pdf_extractor.extract(path)
        elif doc_type is DocumentType.XLSX:
            c = spreadsheet.extract_xlsx(path)
        elif doc_type is DocumentType.CSV:
            c = spreadsheet.extract_csv(path)
        elif doc_type is DocumentType.MARKDOWN:
            c = markdown_extractor.extract(path)
        elif doc_type is DocumentType.TXT:
            c = text_extractor.extract(path)
        else:
            # Unknown: best-effort plain-text read so the LLM fallback has input.
            c = text_extractor.extract(path)
        return c, list(c.issues)
    except Exception as exc:
        logger.error("Extraction failed for %s (%s): %s", path, doc_type, exc)
        return ExtractedContent(), [f"Extraction error: {exc}"]


# ── Stage 2/3 → 5 → 6 → 7 → 8 ────────────────────────────────────────────

def _run_stages(
    content: ExtractedContent,
    *,
    doc_type: DocumentType,
    provider,
    allow_llm: bool,
    llm_threshold: int,
    extra_issues: list[str],
) -> ParseResult:
    issues = list(extra_issues)

    # Stage 2 — structured (tables).
    table_reqs = structured.requirements_from_tables(content.tables) if content.tables else []

    # Stage 3 — semi-structured (text), used when tables are weak/absent.
    if len(table_reqs) >= MIN_DETERMINISTIC:
        requirements = table_reqs
        parser_used = ParserStrategy.TABLE.value
    else:
        semi_reqs = semistructured.parse_semistructured(content.text)
        if len(semi_reqs) >= len(table_reqs):
            requirements = semi_reqs
            parser_used = (
                ParserStrategy.PDF_TEXT.value
                if doc_type is DocumentType.PDF
                else ParserStrategy.SEMI_STRUCTURED.value
            )
        else:
            requirements = table_reqs
            parser_used = ParserStrategy.TABLE.value

    # Stage 6 — metadata enrichment (deterministic, runs on every requirement).
    for req in requirements:
        metadata.enrich(req)

    # Stage 7 — confidence.
    conf, score_issues = confidence.score_result(
        requirements, parser_used=parser_used, document_type=doc_type.value
    )
    issues.extend(score_issues)

    # Stage 8 — LLM fallback (only when deterministic parsing is insufficient).
    needs_fallback = (
        len(requirements) < MIN_DETERMINISTIC
        or conf < llm_threshold
        or doc_type is DocumentType.UNKNOWN
    )
    if needs_fallback and allow_llm:
        llm_reqs, fb_issues = _try_llm(content.text, provider)
        issues.extend(fb_issues)
        if llm_reqs and len(llm_reqs) >= len(requirements):
            for req in llm_reqs:
                metadata.enrich(req)
            requirements = llm_reqs
            parser_used = ParserStrategy.LLM.value
            conf, score_issues = confidence.score_result(
                requirements, parser_used=parser_used, document_type=doc_type.value
            )
            # LLM path is non-deterministic; cap confidence so callers can tell.
            conf = min(conf, 85)
            issues.extend(score_issues)
    elif needs_fallback and not allow_llm:
        issues.append("Deterministic confidence below threshold but LLM fallback is disabled.")

    # Stage 6.5 — quality scoring on the final requirement set. Deterministic
    # and additive; reuses the enriched metadata, never re-parses it.
    for req in requirements:
        req.quality = quality.assess(req)

    return ParseResult(
        requirements=requirements,
        document_type=doc_type,
        parser_used=parser_used,
        confidence=conf,
        issues=_dedupe(issues),
    )


def _try_llm(text: str, provider) -> tuple[list[ParsedRequirement], list[str]]:
    if provider is None:
        return [], ["LLM fallback skipped: no provider configured."]
    try:
        from . import llm_fallback

        reqs = llm_fallback.llm_extract(text, provider)
        if not reqs:
            return [], ["LLM fallback returned no requirements."]
        return reqs, []
    except Exception as exc:
        logger.error("LLM fallback failed: %s", exc)
        return [], [f"LLM fallback failed: {exc}"]


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out
