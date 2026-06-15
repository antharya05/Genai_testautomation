"""AutoTest AI — requirement parsing pipeline.

Public surface:
    parse_document(path, ...) -> ParseResult   # rich, multi-stage result
    parse_text(text, ...)     -> ParseResult   # rich result for pasted text
    parse_requirements(text)  -> list[str]     # backward-compatible shim

The deterministic-first design keeps the great majority of automotive
requirements off the LLM path; the LLM fallback is opt-in via a provider.
"""

from __future__ import annotations

from .pipeline import (
    DEFAULT_LLM_THRESHOLD,
    parse_document,
    parse_text,
)
from .types import (
    DocumentType,
    ParsedRequirement,
    ParseResult,
    ParserStrategy,
)

__all__ = [
    "parse_document",
    "parse_text",
    "parse_requirements",
    "ParseResult",
    "ParsedRequirement",
    "DocumentType",
    "ParserStrategy",
    "DEFAULT_LLM_THRESHOLD",
]


def parse_requirements(text: str, provider=None) -> list[str]:
    """Backward-compatible entry point.

    Mirrors the historical ``parser.parse_requirements(text) -> list[str]``
    contract that generation depends on. Runs the deterministic pipeline; only
    falls back to the LLM when a ``provider`` is supplied and deterministic
    confidence is low. With no provider it is fully deterministic.
    """
    result = parse_text(text, provider=provider, allow_llm=provider is not None)
    return result.as_strings()
