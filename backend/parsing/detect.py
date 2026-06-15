"""Stage 1 — Document type detection.

Detection is layered: trust the file extension first (fast, reliable for the
formats we accept), then fall back to magic-byte sniffing so a mislabeled or
extension-less upload still routes to the correct deterministic parser.
"""

from __future__ import annotations

import os

from .types import DocumentType

_EXT_MAP = {
    ".docx": DocumentType.DOCX,
    ".pdf": DocumentType.PDF,
    ".xlsx": DocumentType.XLSX,
    ".xlsm": DocumentType.XLSX,
    ".csv": DocumentType.CSV,
    ".txt": DocumentType.TXT,
    ".md": DocumentType.MARKDOWN,
    ".markdown": DocumentType.MARKDOWN,
}


def detect_from_extension(filename: str) -> DocumentType:
    ext = os.path.splitext(filename.lower())[1]
    return _EXT_MAP.get(ext, DocumentType.UNKNOWN)


def detect_from_bytes(path: str) -> DocumentType:
    """Sniff magic bytes. DOCX/XLSX are both ZIP containers, so we peek at the
    central-directory entry names to tell an Office document apart."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(8)
    except OSError:
        return DocumentType.UNKNOWN

    if head.startswith(b"%PDF"):
        return DocumentType.PDF

    # ZIP container -> could be DOCX or XLSX (OOXML).
    if head[:2] == b"PK":
        try:
            import zipfile

            with zipfile.ZipFile(path) as zf:
                names = zf.namelist()
            if any(n.startswith("word/") for n in names):
                return DocumentType.DOCX
            if any(n.startswith("xl/") for n in names):
                return DocumentType.XLSX
        except Exception:
            return DocumentType.UNKNOWN

    return DocumentType.UNKNOWN


def detect_document_type(path: str, filename: str | None = None) -> DocumentType:
    """Resolve the document type, preferring the extension and falling back to
    content sniffing."""
    name = filename or os.path.basename(path)
    by_ext = detect_from_extension(name)
    if by_ext is not DocumentType.UNKNOWN:
        return by_ext
    return detect_from_bytes(path)
