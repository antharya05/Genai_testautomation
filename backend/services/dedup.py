"""Test-case deduplication.

The previous implementation compared *titles only* with a global, cross-batch
seen-list. That produced ~35/77 false-positive removals in production: boundary
variants ("… Below/At/Above Threshold") and generic titles ("Safety Test",
"Timing Test") collided across unrelated requirements, and two requirements lost
100% of their coverage.

This module replaces that with content- and scope-aware deduplication:

  * Deduplication is scoped to a single ``requirement_id`` — two cases belonging
    to different requirements are NEVER duplicates.
  * Distinct ``boundary_position`` values (below / at / above) are NEVER
    duplicates — they are deliberate, different coverage.
  * Distinct ``test_type`` values (functional, boundary, negative, timing,
    safety, recovery, stress, fault_injection) are NEVER duplicates — they are
    legitimate variants to preserve.
  * Only when requirement_id, boundary_position AND test_type all match do we
    compare the actual *content* (objective + steps + expected results); a case
    is removed only if that content is near-identical to one already kept.

Titles are intentionally NOT part of the duplicate decision.
"""

from difflib import SequenceMatcher

# Two cases that already share (requirement_id, boundary_position, test_type)
# are duplicates only if their objective+steps+expected content is at least this
# similar. High by design: we are catching genuine repeats, not variants.
CONTENT_SIMILARITY_THRESHOLD = 0.90


# ── Field access (works for TestCase pydantic objects and plain dicts) ─────
def _get(tc, key, default=None):
    if isinstance(tc, dict):
        return tc.get(key, default)
    return getattr(tc, key, default)


def _normalize(text: str) -> str:
    return " ".join(str(text).lower().strip().split())


def _normalize_list(items) -> list[str]:
    return [_normalize(x) for x in (items or []) if str(x).strip()]


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


# ── Identity ───────────────────────────────────────────────────────────────
def variant_key(tc) -> tuple[str, str, str]:
    """The coverage 'slot' a case occupies. Cases in different slots are always
    distinct coverage and must never be deduplicated against each other.

    Slot = (requirement_id, boundary_position, test_type). This single key
    enforces three of the rules at once: per-requirement scope, boundary-variant
    preservation, and test-type-variant preservation.
    """
    req_id = _normalize(_get(tc, "requirement_id", "") or "")
    boundary = _normalize(_get(tc, "boundary_position", "") or "")
    test_type = _normalize(_get(tc, "test_type", "") or "")
    return (req_id, boundary, test_type)


def steps_signature(tc) -> str:
    """Normalised, ordered test steps — the test procedure."""
    return " | ".join(_normalize_list(_get(tc, "steps", [])))


def expected_signature(tc) -> str:
    """Normalised, ordered expected results — the test outcome."""
    return " | ".join(_normalize_list(_get(tc, "expected_results", [])))


def is_same_test(a, b) -> bool:
    """True only when two cases occupy the same coverage slot AND their actual
    procedure and outcome are near-identical — i.e. one is a genuine repeat of
    the other.

    The decision is made on STEPS and EXPECTED RESULTS (the substance of the
    test objective), never on the title — a reworded title must not hide a true
    duplicate, nor split one apart. Both the procedure and the outcome must
    match, so two cases that share steps but verify different outcomes are kept.
    """
    if variant_key(a) != variant_key(b):
        return False
    sa, sb = steps_signature(a), steps_signature(b)
    ea, eb = expected_signature(a), expected_signature(b)
    # Empty-vs-empty is treated as identical (validator guarantees non-empty in
    # practice, but be defensive).
    steps_match = (sa == sb) or (bool(sa or sb) and similarity(sa, sb) >= CONTENT_SIMILARITY_THRESHOLD)
    expected_match = (ea == eb) or (bool(ea or eb) and similarity(ea, eb) >= CONTENT_SIMILARITY_THRESHOLD)
    return steps_match and expected_match


def deduplicate(cases: list) -> tuple[list, int]:
    """Remove genuine repeats from a list of test cases.

    Intended to be called with the cases of a SINGLE requirement (which is how
    the generator invokes it), but the requirement_id is also part of the
    variant key, so mixing requirements here still never deduplicates across
    them. Returns (unique_cases, removed_count).
    """
    kept: list = []
    removed = 0
    for tc in cases:
        if any(is_same_test(tc, k) for k in kept):
            removed += 1
        else:
            kept.append(tc)
    return kept, removed


# ── Legacy title-only API (deprecated; retained for backward compatibility) ──
# Superseded by deduplicate(); kept so any external import keeps importing.
SIMILARITY_THRESHOLD = 0.85


def is_duplicate(title: str, existing_titles: list[str], threshold: float = SIMILARITY_THRESHOLD) -> bool:
    """DEPRECATED — title-only matching. Do not use for test-case dedup; it
    cannot tell boundary/type variants apart. Use deduplicate() instead."""
    for existing in existing_titles:
        if similarity(title, existing) >= threshold:
            return True
    return False


def filter_duplicates(test_cases: list[dict]) -> tuple[list[dict], int]:
    """Content/scope-aware duplicate filter for a list of dicts. Delegates to
    deduplicate() so it shares the corrected semantics."""
    return deduplicate(test_cases)
