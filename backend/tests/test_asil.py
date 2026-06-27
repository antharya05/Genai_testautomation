"""ASIL resolution, estimation, and coverage-depth classification."""

import pytest

from services import asil
from services import requirement_analyzer as analyzer


def test_parsed_asil_is_authoritative():
    r = asil.resolve_asil("brake hard", parsed_asil="ASIL D")
    assert r["asil"] == "D"
    assert r["asil_source"] == "requirement"
    assert r["asil_confidence"] == 100


def test_inline_stated_asil_detected():
    assert asil.extract_explicit_asil("This is [ASIL C] critical") == "C"
    assert asil.extract_explicit_asil("ASIL-B requirement") == "B"
    assert asil.extract_explicit_asil("no level here") is None


def test_estimation_when_not_stated():
    r = asil.resolve_asil("The airbag shall deploy on collision")
    assert r["asil_source"] == "estimated"
    assert r["asil"] == "D"  # airbag/collision are top-tier hazards


def test_estimate_asil_tiers_and_confidence():
    level, conf = asil.estimate_asil("brake collision airbag")
    assert level == "D"
    assert 0 <= conf <= 100
    qm_level, qm_conf = asil.estimate_asil("infotainment ambient lighting")
    assert qm_level == "QM"


def test_estimate_unknown_falls_back_to_qm_low_confidence():
    level, conf = asil.estimate_asil("the colour of the panel")
    assert level == "QM"
    assert conf <= 30


@pytest.mark.parametrize(
    "asil_level, present, count, expected",
    [
        ("D", {"functional", "timing", "safety"}, 5, "covered"),
        ("D", {"functional"}, 1, "partial"),
        ("B", set(), 0, "uncovered"),
        ("QM", {"functional"}, 2, "covered"),
        ("C", {"functional", "negative", "fault_injection"}, 3, "covered"),
        ("C", {"functional"}, 3, "partial"),
    ],
)
def test_coverage_status(asil_level, present, count, expected):
    assert asil.coverage_status(asil_level, present, count) == expected


def test_asil_min_test_types_present_for_all_levels():
    for level in ("QM", "A", "B", "C", "D"):
        assert level in asil.ASIL_MIN_TEST_TYPES
        assert "functional" in asil.ASIL_MIN_TEST_TYPES[level]


def test_asil_propagates_into_metadata():
    # Stated ASIL wins through the metadata layer.
    meta = analyzer.extract_metadata("REQ_1: stop", parsed={"statement": "stop", "asil": "C"})
    assert meta["asil"] == "C" and meta["asil_source"] == "requirement"
    # Estimated path when unstated.
    meta2 = analyzer.extract_metadata("REQ_2: airbag deploy on crash")
    assert meta2["asil"] == "D" and meta2["asil_source"] == "estimated"
