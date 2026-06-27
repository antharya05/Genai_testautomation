"""Content/scope-aware deduplication."""

from services import dedup


def _c(req="REQ_1", bp="", tt="functional", steps=None, expected=None, title="t"):
    return {
        "requirement_id": req,
        "boundary_position": bp,
        "test_type": tt,
        "title": title,
        "steps": steps or ["apply the brake pedal fully"],
        "expected_results": expected or ["brake engages"],
    }


def test_variant_key_components():
    assert dedup.variant_key(_c(req="REQ_2", bp="at", tt="timing")) == ("req_2", "at", "timing")


def test_genuine_repeat_removed():
    a = _c()
    b = _c(title="different title but same content")
    kept, removed = dedup.deduplicate([a, b])
    assert removed == 1
    assert len(kept) == 1


def test_boundary_variants_preserved():
    cases = [_c(bp="below", tt="boundary"), _c(bp="at", tt="boundary"), _c(bp="above", tt="boundary")]
    kept, removed = dedup.deduplicate(cases)
    assert removed == 0
    assert len(kept) == 3


def test_test_type_variants_preserved():
    cases = [_c(tt="functional"), _c(tt="timing"), _c(tt="safety")]
    kept, removed = dedup.deduplicate(cases)
    assert removed == 0 and len(kept) == 3


def test_different_requirements_never_duplicates():
    a = _c(req="REQ_1")
    b = _c(req="REQ_2")  # identical content, different requirement
    assert dedup.is_same_test(a, b) is False
    kept, removed = dedup.deduplicate([a, b])
    assert removed == 0


def test_distinct_content_same_slot_kept():
    a = _c(steps=["press pedal"], expected=["car stops"])
    b = _c(steps=["release pedal"], expected=["car accelerates"])
    kept, removed = dedup.deduplicate([a, b])
    assert removed == 0 and len(kept) == 2


def test_similarity_bounds():
    assert dedup.similarity("abc", "abc") == 1.0
    assert 0.0 <= dedup.similarity("abc", "xyz") < 1.0
