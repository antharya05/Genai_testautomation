"""Validation / repair pipeline and post-generation coverage validation."""

from models import TestCase as TC  # aliased so pytest doesn't try to collect it
from services import validator


def test_repair_fills_defaults_on_empty():
    out = validator.repair({}, fallback_req_id="REQ_X", tc_index=3)
    assert out["test_id"] == "TC_003"
    assert out["requirement_id"] == "REQ_X"
    assert out["asil"] == "QM"
    assert out["test_type"] == "functional"
    assert out["steps"] and out["expected_results"]
    assert out["title"].strip()


def test_repair_normalises_invalid_enums():
    out = validator.repair({"asil": "Z", "test_type": "nonsense", "boundary_position": "AT",
                            "steps": "single step", "expected_results": ["ok"], "title": "t"})
    assert out["asil"] == "QM"
    assert out["test_type"] == "functional"
    assert out["boundary_position"] == "at"
    assert out["steps"] == ["single step"]  # string coerced to list


def test_validate_batch_keeps_valid_drops_unparseable():
    raw = [
        {"title": "good", "steps": ["s"], "expected_results": ["e"], "requirement_id": "REQ_1"},
        "this is not a dict",  # cannot be repaired → dropped with a warning
    ]
    cases, warnings = validator.validate_batch(raw, req_id="REQ_1")
    assert len(cases) == 1
    assert len(warnings) == 1
    assert isinstance(cases[0], TC)


def _case(**kw):
    base = dict(title="t", steps=["do x"], expected_results=["x happens"],
                requirement_id="REQ_50", test_type="functional", boundary_position="")
    base.update(kw)
    return TC(**base)


def test_validate_coverage_flags_missing_boundary():
    meta = {
        "requirement_id": "REQ_50",
        "thresholds": [{"raw": "150ms", "unit": "ms", "operator": "<="}],
        "numeric_tokens": {"150ms"},
        "asil": "QM",
    }
    cases = [_case(boundary_position="below", test_type="boundary"),
             _case(boundary_position="at", test_type="boundary")]
    report = validator.validate_coverage(cases, meta)
    assert report["boundary_coverage"]["missing"] == ["above"]
    assert any("boundary" in w.lower() for w in report["warnings"])


def test_validate_coverage_flags_hallucinated_value():
    meta = {"requirement_id": "REQ_50", "thresholds": [], "numeric_tokens": {"150ms"}, "asil": "QM"}
    bad = _case(expected_results=["responds in 999 ms"])
    report = validator.validate_coverage([bad], meta)
    assert "999ms" in report["hallucinated_values"]
    assert bad.validation_status == "warning"
    assert bad.coverage_warnings


def test_validate_coverage_reports_asil_depth_gap():
    meta = {"requirement_id": "REQ_50", "thresholds": [], "numeric_tokens": set(), "asil": "D"}
    # Only a functional case for an ASIL-D requirement → missing timing/safety.
    report = validator.validate_coverage([_case(test_type="functional")], meta)
    missing = set(report["asil_coverage"]["missing_test_types"])
    assert {"timing", "safety"} & missing
    assert report["asil_coverage"]["asil"] == "D"


def test_validate_coverage_empty_cases():
    report = validator.validate_coverage([], {"requirement_id": "REQ_50", "asil": "QM"})
    assert any("no valid test cases" in w.lower() for w in report["warnings"])
