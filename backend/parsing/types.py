"""Core data structures for the requirement parsing pipeline.

These types are deliberately dependency-free (stdlib only) so that every
stage of the pipeline can import them without pulling in heavy parsing
libraries.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class DocumentType(str, Enum):
    """Detected source document format (Stage 1)."""

    DOCX = "docx"
    PDF = "pdf"
    XLSX = "xlsx"
    CSV = "csv"
    TXT = "txt"
    MARKDOWN = "markdown"
    UNKNOWN = "unknown"


class ParserStrategy(str, Enum):
    """Which extraction strategy produced a requirement / result."""

    TABLE = "table"                # Stage 2 deterministic table parsing
    SEMI_STRUCTURED = "semistructured"  # Stage 3 ID / numbered / bullet / section
    PDF_TEXT = "pdf_text"          # Stage 4 PDF text-flow parsing
    LLM = "llm"                    # Stage 8 fallback
    NONE = "none"


# Canonical requirement categories (Stage 6).
CATEGORY_FUNCTIONAL = "functional"
CATEGORY_PERFORMANCE = "performance"
CATEGORY_SAFETY = "safety"
CATEGORY_INTERFACE = "interface"
CATEGORY_UNKNOWN = "uncategorized"


@dataclass
class ParsedRequirement:
    """A single extracted requirement with its metadata (Stage 6)."""

    statement: str
    requirement_id: str | None = None
    title: str | None = None
    description: str | None = None
    # Structured-table extras (preserved when present).
    area: str | None = None
    asil: str | None = None
    test_focus: str | None = None
    # Stage 6 metadata.
    entities: list[str] = field(default_factory=list)
    thresholds: list[str] = field(default_factory=list)
    units: list[str] = field(default_factory=list)
    timing_constraints: list[str] = field(default_factory=list)
    logical_operators: list[str] = field(default_factory=list)
    category: str = CATEGORY_UNKNOWN
    # Provenance / scoring.
    source: str = ParserStrategy.NONE.value
    confidence: int = 0
    # Stage 6.5 — deterministic requirement-quality assessment (set by the
    # pipeline after metadata enrichment). None until scored.
    quality: dict | None = None

    def as_text(self) -> str:
        """Flatten to the single string the generation pipeline expects.

        Preserves the historical shape: an ID prefix (when known) followed
        by the requirement statement, so downstream caching / traceability
        keys stay stable. When the document supplied an ASIL (e.g. a table
        column), it is appended as a compact ``[ASIL X]`` tag so the value
        survives the ``list[str]`` hand-off into generation and is recognised
        there as document-stated (source = "requirement").
        """
        if self.requirement_id:
            base = f"{self.requirement_id}: {self.statement}".strip()
        else:
            base = self.statement.strip()

        asil = (self.asil or "").strip().upper()
        if asil in {"QM", "A", "B", "C", "D"} and "ASIL" not in base.upper():
            base = f"{base} [ASIL {asil}]"
        return base

    def to_dict(self) -> dict:
        return {
            "requirement_id": self.requirement_id,
            "title": self.title,
            "statement": self.statement,
            "description": self.description,
            "area": self.area,
            "asil": self.asil,
            "test_focus": self.test_focus,
            "entities": self.entities,
            "thresholds": self.thresholds,
            "units": self.units,
            "timing_constraints": self.timing_constraints,
            "logical_operators": self.logical_operators,
            "category": self.category,
            "source": self.source,
            "confidence": self.confidence,
            "quality": self.quality,
        }


@dataclass
class ParseResult:
    """Output of the full pipeline (Stage 7 envelope)."""

    requirements: list[ParsedRequirement] = field(default_factory=list)
    document_type: DocumentType = DocumentType.UNKNOWN
    parser_used: str = ParserStrategy.NONE.value
    confidence: int = 0
    issues: list[str] = field(default_factory=list)

    def as_strings(self) -> list[str]:
        """Backward-compatible projection consumed by generation."""
        return [r.as_text() for r in self.requirements if r.as_text().strip()]

    def to_dict(self) -> dict:
        return {
            "document_type": self.document_type.value,
            "parser_used": self.parser_used,
            "confidence": self.confidence,
            "issues": self.issues,
            "requirements": [r.to_dict() for r in self.requirements],
        }
