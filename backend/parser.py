import re
import os
import json

from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

PARSE_PROMPT = """You are an expert requirements analyst for automotive software systems.

Read the following document text and extract ALL software requirements.

A requirement is any statement that describes:
- What the system SHALL or MUST do
- Functional behavior expected from the system
- Performance, safety, or interface constraints
- Numbered or labeled requirement statements (REQ_001, FR-001, etc.)

Return ONLY a valid JSON array of strings. Each string is one complete requirement.
No markdown, no explanation, no extra text.

Example output:
["The system shall monitor brake pressure every 10ms", "REQ_001: ECU shall respond within 50ms"]"""


def parse_requirements(text: str) -> list[str]:
    try:
        return _ai_parse(text)
    except Exception:
        return _regex_parse(text)


def _ai_parse(text: str) -> list[str]:
    from groq import Groq

    client = Groq(api_key=GROQ_API_KEY)

    # Trim text to avoid token limits (keep first 6000 chars)
    trimmed = text[:6000] if len(text) > 6000 else text

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": PARSE_PROMPT},
            {"role": "user", "content": f"Extract requirements from this document:\n\n{trimmed}"}
        ],
        temperature=0.1,
        max_tokens=2048,
    )

    content = response.choices[0].message.content.strip()

    # Strip markdown code fences if present
    if content.startswith("```"):
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```$", "", content)

    requirements = json.loads(content)

    if not isinstance(requirements, list) or len(requirements) == 0:
        raise ValueError("AI returned empty or invalid requirements list")

    return [r.strip() for r in requirements if isinstance(r, str) and len(r.strip()) > 10]


def _regex_parse(text: str) -> list[str]:
    # 1. Structured ID patterns: REQ_001, FR-001, SRS_001, etc.
    id_pattern = r"((?:REQ|FR|SRS|UC|SWR|HWR|SYS|TST|FUNC|INT|SYS)[-_]\d+[\w]*[^\n]*(?:\n(?!(?:REQ|FR|SRS|UC|SWR|HWR|SYS|TST|FUNC|INT|SYS)[-_]\d+)[^\n]*)*)"
    matches = re.findall(id_pattern, text, re.IGNORECASE)
    cleaned = [m.strip() for m in matches if len(m.strip()) > 10]
    if len(cleaned) >= 2:
        return cleaned

    # 2. Numbered requirements: "1. ...", "1.1 ...", "2) ..."
    numbered_pattern = r"(?:^|\n)(\d+[\.\)]\d*[\.\)]?\s+.+?)(?=\n\d+[\.\)]\d*[\.\)]?\s+|\Z)"
    matches = re.findall(numbered_pattern, text, re.DOTALL)
    cleaned = [m.strip() for m in matches if len(m.strip()) > 15]
    if len(cleaned) >= 2:
        return cleaned

    # 3. SHALL statements
    shall_pattern = r"[^.!?\n]*\bshall\b[^.!?\n]*[.!?]?"
    matches = re.findall(shall_pattern, text, re.IGNORECASE)
    cleaned = [m.strip() for m in matches if len(m.strip()) > 20]
    if len(cleaned) >= 1:
        return cleaned

    # 4. Fallback: non-empty lines longer than 20 chars (cap at 50)
    lines = [line.strip() for line in text.split("\n") if len(line.strip()) > 20]
    return lines[:50]
