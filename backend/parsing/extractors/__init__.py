"""Format-specific extractors.

Each extractor turns a file on disk into an :class:`ExtractedContent`:
plain text plus any tables it could recover deterministically. Extractors do
NOT decide what is a requirement — that is the job of the structured /
semi-structured stages.
"""

from __future__ import annotations

from dataclasses import dataclass, field

Table = list[list[str]]


@dataclass
class ExtractedContent:
    text: str = ""
    tables: list[Table] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)
