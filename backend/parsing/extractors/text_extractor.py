"""Plain-text (.txt) extractor."""

from __future__ import annotations

from . import ExtractedContent


def extract(path: str) -> ExtractedContent:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return ExtractedContent(text=fh.read())


def extract_from_text(text: str) -> ExtractedContent:
    return ExtractedContent(text=text or "")
