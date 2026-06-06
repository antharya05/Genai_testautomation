from difflib import SequenceMatcher

SIMILARITY_THRESHOLD = 0.85


def _normalize(text: str) -> str:
    return " ".join(text.lower().strip().split())


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def is_duplicate(title: str, existing_titles: list[str], threshold: float = SIMILARITY_THRESHOLD) -> bool:
    for existing in existing_titles:
        if similarity(title, existing) >= threshold:
            return True
    return False


def filter_duplicates(test_cases: list[dict]) -> tuple[list[dict], int]:
    seen: list[str] = []
    unique: list[dict] = []
    removed = 0
    for tc in test_cases:
        title = tc.get("title", "")
        if is_duplicate(title, seen):
            removed += 1
        else:
            seen.append(title)
            unique.append(tc)
    return unique, removed
