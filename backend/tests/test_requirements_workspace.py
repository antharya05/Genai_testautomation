"""Requirements Workspace — metadata persistence, coverage aggregation, APIs."""

import uuid

import pytest

from services import db_service as svc


def _parsed(rid, statement, asil, score):
    return {
        "requirement_id": rid, "statement": statement, "description": "",
        "area": None, "asil": asil, "test_focus": None,
        "entities": ["Brake_Signal"], "thresholds": ["150 ms"], "units": ["ms"],
        "timing_constraints": ["150 ms"], "logical_operators": [], "category": "safety",
        "source": "table", "confidence": 95,
        "quality": {"quality_score": score, "quality_level": "Good",
                    "issues": [], "warnings": [], "strengths": ["measurable"]},
    }


def _key(p):
    return f"{p['requirement_id']}: {p['statement']}"


@pytest.fixture
def seeded_project(db_session):
    """A project with one run: REQ_A (QM, covered) and REQ_B (QM, uncovered)."""
    # A real project row must exist — runs.project_id is now an enforced FK.
    pid = svc.create_project(db_session, name="Workspace Test").id
    job_id = str(uuid.uuid4())
    pa = {**_parsed("REQ_A", "The event log shall record faults.", "QM", 88)}
    pb = {**_parsed("REQ_B", "The ambient lamp shall dim at night.", "QM", 60)}
    parsed_meta = {_key(pa): pa, _key(pb): pb}
    reqs = [_key(pa), _key(pb)]

    svc.create_run(db_session, job_id=job_id, project_id=pid, requirements=reqs,
                   provider="fake", model="fake-model", prompt_version="v1",
                   parsed_meta=parsed_meta)
    # REQ_A gets 2 functional cases (QM needs functional, >=2 → covered); REQ_B none.
    test_cases = [
        {"test_id": "TC_001", "requirement_id": "REQ_A", "title": "log fault", "asil": "QM",
         "test_type": "functional", "steps": ["x"], "expected_results": ["y"]},
        {"test_id": "TC_002", "requirement_id": "REQ_A", "title": "log fault 2", "asil": "QM",
         "test_type": "boundary", "steps": ["x"], "expected_results": ["y"]},
    ]
    svc.finalize_run(db_session, job_id, test_cases, rag_enabled=False, outcome="complete")
    return pid


def test_metadata_persisted_on_requirement_rows(db_session, seeded_project):
    reqs, _ = svc._collect_project_requirements(db_session, seeded_project)
    metas = [r.meta for r in reqs]
    assert all(m is not None for m in metas)
    assert any(m["quality"]["quality_score"] == 88 for m in metas)


def test_overview_dedup_and_fields(db_session, seeded_project):
    overview = svc.get_requirements_overview(db_session, seeded_project)
    assert len(overview) == 2
    by_id = {r["requirement_id"]: r for r in overview}
    assert by_id["REQ_A"]["quality_score"] == 88
    assert by_id["REQ_A"]["asil"] == "QM"
    assert by_id["REQ_A"]["category"] == "safety"
    assert by_id["REQ_A"]["coverage_status"] == "covered"
    assert by_id["REQ_B"]["coverage_status"] == "uncovered"


def test_coverage_summary(db_session, seeded_project):
    summary = svc.get_coverage_summary(db_session, seeded_project)
    assert summary["total"] == 2
    assert summary["covered"] == 1
    assert summary["uncovered"] == 1
    assert summary["coverage_pct"] == 50


def test_detail_includes_metadata_and_linked_cases(db_session, seeded_project):
    detail = svc.get_requirement_detail(db_session, seeded_project, "REQ_A")
    assert detail is not None
    assert detail["requirement_id"] == "REQ_A"
    assert detail["quality"]["quality_score"] == 88
    assert detail["thresholds"] == ["150 ms"]
    assert "Brake_Signal" in detail["entities"]
    assert len(detail["linked_test_cases"]) == 2


def test_detail_missing_returns_none(db_session, seeded_project):
    assert svc.get_requirement_detail(db_session, seeded_project, "REQ_NOPE") is None


# ── API surface (protected + wired) ───────────────────────────────────────────

def test_workspace_apis_require_auth(client, seeded_project):
    assert client.get(f"/projects/{seeded_project}/requirements").status_code == 401
    assert client.get(f"/projects/{seeded_project}/coverage").status_code == 401


def test_workspace_apis_return_data(client, auth, seeded_project):
    r = client.get(f"/projects/{seeded_project}/requirements", headers=auth)
    assert r.status_code == 200
    assert len(r.json()) == 2

    cov = client.get(f"/projects/{seeded_project}/coverage", headers=auth)
    assert cov.status_code == 200
    assert cov.json()["total"] == 2

    detail = client.get(f"/projects/{seeded_project}/requirements/REQ_A", headers=auth)
    assert detail.status_code == 200
    assert detail.json()["requirement_id"] == "REQ_A"
