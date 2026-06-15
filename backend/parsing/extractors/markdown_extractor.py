"""Markdown extractor — recovers pipe tables and body text.

GitHub-flavored pipe tables become normalized tables for the structured stage;
the remaining prose (with table blocks and the separator row removed) feeds the
semi-structured fallback.
"""

from __future__ import annotations

import re

from . import ExtractedContent, Table

# A markdown table separator row: | --- | :---: | ---: |
_SEP_RE = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$")
_ROW_RE = re.compile(r"^\s*\|.*\|\s*$")


def _split_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def extract(path: str) -> ExtractedContent:
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return extract_from_text(fh.read())


def extract_from_text(text: str) -> ExtractedContent:
    content = ExtractedContent()
    lines = text.splitlines()
    body_lines: list[str] = []

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        # Detect a table: a header row immediately followed by a separator row.
        if _ROW_RE.match(line) and i + 1 < n and _SEP_RE.match(lines[i + 1]):
            header = _split_row(line)
            table: Table = [header]
            j = i + 2
            while j < n and _ROW_RE.match(lines[j]) and not _SEP_RE.match(lines[j]):
                table.append(_split_row(lines[j]))
                j += 1
            content.tables.append(table)
            i = j
            continue
        body_lines.append(line)
        i += 1

    content.text = "\n".join(body_lines)
    return content
