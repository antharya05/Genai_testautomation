"""Stage 8 — LLM fallback extraction.

This runs ONLY when deterministic parsing is insufficient (too few results, low
confidence, or an unknown document type). It uses the project's BYOK provider
abstraction (``providers.get_provider*``) rather than a hardcoded vendor, so the
fallback honors whatever the user configured in Settings.
"""

from __future__ import annotations

import json
import logging
import re

from .types import ParsedRequirement, ParserStrategy

logger = logging.getLogger(__name__)

PARSE_PROMPT = """You are an expert requirements analyst for automotive software systems.

Read the following document text and extract ALL software requirements.

A requirement is any statement that describes:
- What the system SHALL or MUST do
- Functional behavior expected from the system
- Performance, safety, or interface constraints
- Numbered or labeled requirement statements (REQ_001, FR-001, etc.)

Do NOT extract notes, examples, rationale, explanations, or appendix prose.

Return ONLY a valid JSON array of strings. Each string is one complete requirement.
No markdown, no explanation, no extra text.

Example output:
["The system shall monitor brake pressure every 10ms", "REQ_001: ECU shall respond within 50ms"]"""

# Keep the request within token limits for all providers.
_MAX_CHARS = 12000


def _strip_fences(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```$", "", content)
    return content.strip()


def _coerce_list(content: str) -> list[str]:
    content = _strip_fences(content)
    # Be tolerant: if the model wrapped the array in prose, grab the array.
    if not content.startswith("["):
        m = re.search(r"\[.*\]", content, re.DOTALL)
        if m:
            content = m.group(0)
    data = json.loads(content)
    if not isinstance(data, list):
        raise ValueError("LLM did not return a JSON array.")
    return [s.strip() for s in data if isinstance(s, str) and len(s.strip()) > 10]


def llm_extract(text: str, provider) -> list[ParsedRequirement]:
    """Extract requirements via the configured BYOK provider.

    ``provider`` must expose ``complete(system, user, temperature, max_tokens)``
    (see ``providers.base.LLMProvider``). Returns an empty list on any failure;
    the caller decides how to surface that as an issue.
    """
    if provider is None:
        raise RuntimeError("No LLM provider configured for fallback extraction.")
    if not text or not text.strip():
        return []

    trimmed = text[:_MAX_CHARS]
    content = provider.complete(
        system=PARSE_PROMPT,
        user=f"Extract requirements from this document:\n\n{trimmed}",
        temperature=0.1,
        max_tokens=4096,
    )

    statements = _coerce_list(content)
    out: list[ParsedRequirement] = []
    for s in statements:
        req_id = None
        m = re.match(r"^\s*((?:REQ|FR|NFR|SRS|SYS|SWR|HWR)[_-][A-Z0-9_.\-]*\d+)\s*[:.\-]?\s*", s, re.I)
        if m:
            req_id = m.group(1).upper()
            s = s[m.end():].strip() or s
        out.append(ParsedRequirement(
            statement=s,
            requirement_id=req_id,
            source=ParserStrategy.LLM.value,
        ))
    return out
