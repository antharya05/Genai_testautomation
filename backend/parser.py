"""Backward-compatibility shim.

The real implementation now lives in the :mod:`parsing` package — a multi-stage,
deterministic-first pipeline with confidence scoring and a BYOK LLM fallback.

This module is kept so existing imports (``from parser import parse_requirements``)
keep working unchanged. Prefer importing from :mod:`parsing` directly for new
code, which gives you the rich :class:`parsing.ParseResult` instead of a flat
list of strings.
"""

from __future__ import annotations

from parsing import parse_document, parse_requirements, parse_text  # noqa: F401

__all__ = ["parse_requirements", "parse_document", "parse_text"]
