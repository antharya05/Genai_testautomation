import re


def parse_requirements(text: str) -> list[str]:
    """
    Detects requirement format automatically and splits into individual requirements.
    Priority: structured IDs > numbered lists > SHALL statements > paragraph fallback.
    """

    # 1. Structured ID patterns: REQ_001, FR-001, SRS_001, UC_001, SWR-001, etc.
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
