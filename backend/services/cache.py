import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_store: dict[str, list[dict]] = {}


def _key(requirement_text: str, prompt_version: str) -> str:
    payload = f"{requirement_text.strip()}::{prompt_version}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get(requirement_text: str, prompt_version: str) -> Optional[list[dict]]:
    k = _key(requirement_text, prompt_version)
    hit = _store.get(k)
    if hit:
        logger.info("Cache hit key=%s", k[:12])
    return hit


def set(requirement_text: str, prompt_version: str, test_cases: list[dict]) -> None:
    k = _key(requirement_text, prompt_version)
    _store[k] = test_cases
    logger.info("Cached %d cases key=%s", len(test_cases), k[:12])


def clear() -> None:
    _store.clear()


def size() -> int:
    return len(_store)
