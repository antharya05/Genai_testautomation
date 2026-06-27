"""Requirement quality scoring (parsing.quality.assess)."""

from parsing.quality import assess

GOOD = {
    "statement": "When the vehicle speed exceeds 120 km/h, the system shall limit "
                 "engine torque within 50 ms.",
    "description": "",
    "thresholds": ["120 km/h", "50 ms"],
    "units": ["km/h", "ms"],
    "timing_constraints": ["50 ms"],
    "logical_operators": [],
    "entities": ["engine_torque"],
    "category": "performance",
}

POOR = {
    "statement": "The system should be fast and user-friendly.",
    "description": "",
    "thresholds": [],
    "units": [],
    "timing_constraints": [],
    "logical_operators": [],
    "entities": [],
    "category": "functional",
}


def test_good_requirement_scores_high():
    r = assess(GOOD)
    assert r["quality_score"] >= 70
    assert r["quality_level"] in ("Good", "Excellent")
    assert r["strengths"]


def test_poor_requirement_scores_low():
    r = assess(POOR)
    assert r["quality_score"] < 50
    assert r["quality_level"] == "Poor"
    assert r["issues"]


def test_good_scores_above_poor():
    assert assess(GOOD)["quality_score"] > assess(POOR)["quality_score"]


def test_ambiguous_terms_flagged():
    r = assess(POOR)
    joined = " ".join(r["issues"]).lower()
    assert "ambiguous" in joined or "vague" in joined


def test_measurable_requirement_has_threshold_strength():
    r = assess(GOOD)
    assert any("threshold" in s.lower() or "timing" in s.lower() for s in r["strengths"])


def test_score_is_bounded():
    for case in (GOOD, POOR):
        s = assess(case)["quality_score"]
        assert 0 <= s <= 100


def test_accepts_object_with_attributes():
    class Req:
        statement = GOOD["statement"]
        description = ""
        thresholds = GOOD["thresholds"]
        units = GOOD["units"]
        timing_constraints = GOOD["timing_constraints"]
        logical_operators = []
        entities = GOOD["entities"]
        category = "performance"

    assert assess(Req())["quality_score"] >= 70
