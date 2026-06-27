"""Phase 4 — requirements lifecycle: versioning, change-class, run↔version
linkage, impact analysis, approval invalidation, baselines, backfill."""

import uuid

from database import SessionLocal
from db_models import Requirement, Run
from services import db_service as svc
from services import lifecycle as lc

PID_PREFIX = "Lifecycle"


def _project(db):
    return svc.create_project(db, name=f"{PID_PREFIX} {uuid.uuid4().hex[:6]}").id


def _complete_run(db, project_id, specs, approve=False):
    """specs: list of (key, statement). Creates a complete run (+1 case each)."""
    run_id = str(uuid.uuid4())
    reqs = [f"{k}: {s}" for k, s in specs]
    parsed_meta = {f"{k}: {s}": {"requirement_id": k, "statement": s, "category": "functional"}
                   for k, s in specs}
    svc.create_run(db, job_id=run_id, project_id=project_id, requirements=reqs,
                   provider="fake", model="m", prompt_version="v1", parsed_meta=parsed_meta)
    tcs = [{
        "test_id": f"TC_{i + 1:03d}", "requirement_id": k, "title": f"case {k}",
        "asil": "QM", "test_type": "functional", "steps": ["s"], "expected_results": ["e"],
        "source_requirement_text": f"{k}: {s}",
    } for i, (k, s) in enumerate(specs)]
    svc.finalize_run(db, run_id, tcs, rag_enabled=False, outcome="complete")
    if approve:
        for tc in svc.get_test_cases_for_run(db, run_id):
            svc.patch_test_case_review(db, run_id=run_id, test_id=tc.test_id,
                                       review_status="approved", actor_id="a@x", actor_display="A")
        svc.approve_run(db, run_id, "a@x", "Alice")
    return run_id


# ── Versioning + dedup ────────────────────────────────────────────────────────

def test_generation_creates_v1_and_dedups_identical_content():
    db = SessionLocal()
    try:
        pid = _project(db)
        _complete_run(db, pid, [("REQ-A-001", "the system shall brake in 100 ms")])
        cat = lc.get_catalog(db, pid, "REQ-A-001")
        assert cat is not None
        v1 = lc.current_version(db, cat)
        assert v1.version_no == 1

        # Re-generate identical content → no new version (dedup by content hash).
        _complete_run(db, pid, [("REQ-A-001", "the system shall brake in 100 ms")])
        cat2 = lc.get_catalog(db, pid, "REQ-A-001")
        assert lc.current_version(db, cat2).version_no == 1
    finally:
        db.close()


def test_changed_content_bumps_version():
    db = SessionLocal()
    try:
        pid = _project(db)
        _complete_run(db, pid, [("REQ-A-002", "brake in 100 ms")])
        _complete_run(db, pid, [("REQ-A-002", "brake in 80 ms")])  # changed → v2
        cat = lc.get_catalog(db, pid, "REQ-A-002")
        assert lc.current_version(db, cat).version_no == 2
    finally:
        db.close()


def test_change_class_suggestion():
    db = SessionLocal()
    try:
        pid = _project(db)
        _complete_run(db, pid, [("REQ-A-003", "Brake within 100 ms.")])
        cat = lc.get_catalog(db, pid, "REQ-A-003")
        v1 = lc.current_version(db, cat)
        # editorial: whitespace/case only
        assert lc.suggest_change_class(v1, "brake   within 100 ms.", {"category": "functional"}) == "editorial"
        # minor: wording changed, semantics intact
        assert lc.suggest_change_class(v1, "Apply the brake within 100 ms.", {"category": "functional"}) == "minor"
        # major: semantic meta changed
        assert lc.suggest_change_class(v1, "Brake within 100 ms.", {"category": "functional", "asil": "D"}) == "major"
    finally:
        db.close()


# ── Run ↔ version linkage ─────────────────────────────────────────────────────

def test_run_records_exact_version_and_stays_valid_after_bump():
    db = SessionLocal()
    try:
        pid = _project(db)
        run_id = _complete_run(db, pid, [("REQ-A-004", "v1 statement")])
        req = db.query(Requirement).filter(Requirement.run_id == run_id).first()
        v1_id = req.requirement_version_id
        assert v1_id is not None
        run = db.get(Run, run_id)
        assert run.requirement_versions_digest is not None

        # Advance to v2 — the run's linkage must still point at v1.
        lc.revise_requirement(db, pid, "REQ-A-004", "v2 statement", {"category": "functional"},
                              change_reason="update", change_class="major",
                              actor_id="a@x", actor_display="A")
        req2 = db.query(Requirement).filter(Requirement.run_id == run_id).first()
        assert req2.requirement_version_id == v1_id  # immutable linkage
    finally:
        db.close()


# ── Impact analysis + approval invalidation ───────────────────────────────────

def test_major_revision_supersedes_approved_run():
    db = SessionLocal()
    try:
        pid = _project(db)
        run_id = _complete_run(db, pid, [("REQ-A-005", "original")], approve=True)
        assert svc.get_run_governance(db, run_id)["requirement_superseded"] is False

        res = lc.revise_requirement(db, pid, "REQ-A-005", "functionally different", {"asil": "D"},
                                    change_reason="tighten", change_class="major",
                                    actor_id="a@x", actor_display="A")
        assert res["impact"]["affected_run_count"] >= 1
        assert res["impact"]["approved_run_count"] >= 1
        assert res["impact"]["affected_test_cases"] >= 1

        gov = svc.get_run_governance(db, run_id)
        assert gov["requirement_superseded"] is True
        assert gov["supersede_severity"] == "major"
        # Historical approval record is retained (still 'approved').
        assert gov["review_state"] == "approved"
    finally:
        db.close()


def test_editorial_revision_does_not_supersede():
    db = SessionLocal()
    try:
        pid = _project(db)
        run_id = _complete_run(db, pid, [("REQ-A-006", "the brake shall engage")], approve=True)
        lc.revise_requirement(db, pid, "REQ-A-006", "the  brake   shall engage", {"category": "functional"},
                              change_reason="typo", change_class="editorial",
                              actor_id="a@x", actor_display="A")
        gov = svc.get_run_governance(db, run_id)
        assert gov["requirement_superseded"] is False  # editorial-only drift stays valid
    finally:
        db.close()


# ── Baselines ─────────────────────────────────────────────────────────────────

def test_baseline_snapshot_and_diff():
    db = SessionLocal()
    try:
        pid = _project(db)
        _complete_run(db, pid, [("REQ-B-001", "first req")], approve=True)
        b1 = lc.create_baseline(db, pid, "1.0", "first cut", "a@x", "Alice")
        assert b1["requirement_count"] == 1
        assert b1["items"][0]["requirement_key"] == "REQ-B-001"
        assert b1["items"][0]["version_no"] == 1
        assert b1["items"][0]["approval_state"] == "approved"
        assert len(b1["items"][0]["test_cases"]) == 1  # self-contained snapshot

        # Add REQ-B-002 and bump REQ-B-001, then cut 2.0.
        _complete_run(db, pid, [("REQ-B-002", "second req")], approve=True)
        lc.revise_requirement(db, pid, "REQ-B-001", "first req revised", {"asil": "C"},
                              change_reason="x", change_class="major", actor_id="a@x", actor_display="A")
        b2 = lc.create_baseline(db, pid, "2.0", None, "a@x", "Alice")
        assert b2["requirement_count"] == 2

        diff = lc.diff_baselines(db, b1["id"], b2["id"])
        added_keys = {d["requirement_key"] for d in diff["added"]}
        modified_keys = {d["requirement_key"] for d in diff["modified"]}
        assert "REQ-B-002" in added_keys
        assert "REQ-B-001" in modified_keys
    finally:
        db.close()


def test_duplicate_baseline_name_rejected():
    db = SessionLocal()
    try:
        pid = _project(db)
        _complete_run(db, pid, [("REQ-B-010", "req")], approve=True)
        lc.create_baseline(db, pid, "1.0", None, "a@x", "A")
        dup = lc.create_baseline(db, pid, "1.0", None, "a@x", "A")
        assert "already exists" in dup["error"]
    finally:
        db.close()


# ── Backfill ──────────────────────────────────────────────────────────────────

def test_backfill_links_legacy_requirement_rows():
    db = SessionLocal()
    try:
        pid = _project(db)
        # Simulate a legacy run row + requirement with no version link.
        run_id = str(uuid.uuid4())
        from datetime import datetime
        db.add(Run(id=run_id, project_id=pid, status="complete", created_at=datetime.utcnow()))
        db.flush()
        db.add(Requirement(id=str(uuid.uuid4()), run_id=run_id, text="REQ-LEG-001: legacy",
                           requirement_id="REQ-LEG-001", position=0,
                           meta={"statement": "legacy"}, requirement_version_id=None))
        db.commit()

        linked = lc.backfill_requirement_catalog(db)
        assert linked >= 1
        req = db.query(Requirement).filter(Requirement.run_id == run_id).first()
        assert req.requirement_version_id is not None
        assert lc.get_catalog(db, pid, "REQ-LEG-001") is not None

        # Idempotent: a second run links nothing new.
        assert lc.backfill_requirement_catalog(db) == 0
    finally:
        db.close()
