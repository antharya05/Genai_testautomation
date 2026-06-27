"""Phase 3 — review governance: identity, state machine, locking, ledger,
content digest/staleness, and approval-gated exports with manifest."""

import uuid

import pytest

from database import SessionLocal
from db_models import TestCaseDB as TCDB  # aliased so pytest doesn't try to collect it
from services import db_service as svc

APP_PASSWORD = "test-pass"


def _seed_run(db, n=2, prefix=""):
    """A completed run with n pending test cases; returns run_id."""
    pid = svc.create_project(db, name=f"Gov {prefix}{uuid.uuid4().hex[:6]}").id
    run_id = str(uuid.uuid4())
    reqs = [f"REQ_{prefix}{i}: the system shall do {i}" for i in range(n)]
    svc.create_run(db, job_id=run_id, project_id=pid, requirements=reqs,
                   provider="fake", model="m", prompt_version="v1")
    tcs = [{
        "test_id": f"TC_{i + 1:03d}", "requirement_id": f"REQ_{prefix}{i}",
        "title": f"case {i}", "asil": "QM", "test_type": "functional",
        "steps": ["s"], "expected_results": ["e"],
        "source_requirement_text": reqs[i],
    } for i in range(n)]
    svc.finalize_run(db, run_id, tcs, rag_enabled=False, outcome="complete")
    return run_id


def _approve_all(db, run_id, actor_id="rev@x.com", actor_display="Reviewer"):
    for tc in svc.get_test_cases_for_run(db, run_id):
        svc.patch_test_case_review(db, run_id=run_id, test_id=tc.test_id,
                                   review_status="approved",
                                   actor_id=actor_id, actor_display=actor_display)


# ── State machine ─────────────────────────────────────────────────────────────

def test_state_machine_draft_reviewed_approved(db_session):
    run_id = _seed_run(db_session, n=2)
    assert svc.get_run_governance(db_session, run_id)["review_state"] == "draft"

    # One approved, one still pending → still draft, approve refused.
    tcs = svc.get_test_cases_for_run(db_session, run_id)
    svc.patch_test_case_review(db_session, run_id=run_id, test_id=tcs[0].test_id,
                               review_status="approved", actor_id="a@x", actor_display="A")
    assert svc.get_run_governance(db_session, run_id)["review_state"] == "draft"
    assert "error" in svc.approve_run(db_session, run_id, "a@x", "A")

    # All approved → reviewed; approve → approved + locked.
    svc.patch_test_case_review(db_session, run_id=run_id, test_id=tcs[1].test_id,
                               review_status="approved", actor_id="a@x", actor_display="A")
    assert svc.get_run_governance(db_session, run_id)["review_state"] == "reviewed"
    gov = svc.approve_run(db_session, run_id, "a@x", "Alice", note="ship it")
    assert gov["review_state"] == "approved"
    assert gov["locked"] is True
    assert gov["approved_by_display"] == "Alice"


def test_locked_run_rejects_review_writes(db_session):
    run_id = _seed_run(db_session, n=1)
    _approve_all(db_session, run_id)
    svc.approve_run(db_session, run_id, "a@x", "Alice")
    tc = svc.get_test_cases_for_run(db_session, run_id)[0]
    with pytest.raises(svc.RunLockedError):
        svc.patch_test_case_review(db_session, run_id=run_id, test_id=tc.test_id,
                                   review_status="rejected", actor_id="a@x", actor_display="A")


def test_reopen_unlocks_and_recomputes(db_session):
    run_id = _seed_run(db_session, n=1)
    _approve_all(db_session, run_id)
    svc.approve_run(db_session, run_id, "a@x", "Alice")
    gov = svc.reopen_run(db_session, run_id, "a@x", "Alice", note="needs changes")
    assert gov["locked"] is False
    assert gov["review_state"] == "reviewed"          # still all-decided
    assert gov["approved_by_display"] is None
    # Now writable again.
    tc = svc.get_test_cases_for_run(db_session, run_id)[0]
    svc.patch_test_case_review(db_session, run_id=run_id, test_id=tc.test_id,
                               review_status="needs_revision", actor_id="a@x", actor_display="A")
    assert svc.get_run_governance(db_session, run_id)["review_state"] == "reviewed"


def test_approve_requires_all_approved_reject_does_not(db_session):
    run_id = _seed_run(db_session, n=2)
    tcs = svc.get_test_cases_for_run(db_session, run_id)
    svc.patch_test_case_review(db_session, run_id=run_id, test_id=tcs[0].test_id,
                               review_status="approved", actor_id="a@x", actor_display="A")
    svc.patch_test_case_review(db_session, run_id=run_id, test_id=tcs[1].test_id,
                               review_status="rejected", actor_id="a@x", actor_display="A")
    # Reviewed (no pending) but not all approved → approve refused, reject allowed.
    assert svc.get_run_governance(db_session, run_id)["review_state"] == "reviewed"
    assert "error" in svc.approve_run(db_session, run_id, "a@x", "A")
    gov = svc.reject_run(db_session, run_id, "a@x", "Alice", note="defects")
    assert gov["review_state"] == "rejected"
    assert gov["locked"] is True


# ── Ledger ────────────────────────────────────────────────────────────────────

def test_approval_ledger_records_identity_and_metrics(db_session):
    run_id = _seed_run(db_session, n=2)
    _approve_all(db_session, run_id, actor_id="alice@x.com", actor_display="Alice")
    svc.approve_run(db_session, run_id, "alice@x.com", "Alice", note="ok")
    events = svc.list_run_approval_events(db_session, run_id)
    assert len(events) == 1
    e = svc.run_approval_event_to_dict(events[0])
    assert e["to_state"] == "approved"
    assert e["actor_id"] == "alice@x.com"
    assert e["actor_display"] == "Alice"
    assert e["approved_count"] == 2 and e["total_count"] == 2
    assert e["test_cases_digest"]


def test_review_event_carries_future_proof_identity(db_session):
    run_id = _seed_run(db_session, n=1)
    tc = svc.get_test_cases_for_run(db_session, run_id)[0]
    svc.patch_test_case_review(db_session, run_id=run_id, test_id=tc.test_id,
                               review_status="approved",
                               actor_id="bob@x.com", actor_display="Bob")
    ev = svc.review_event_to_dict(svc.get_review_events(db_session, run_id)[0])
    assert ev["actor_id"] == "bob@x.com"
    assert ev["actor_display"] == "Bob"


# ── Content digest / staleness ────────────────────────────────────────────────

def test_digest_is_order_independent_and_content_bound():
    a = {"test_id": "TC_001", "title": "x", "steps": ["1"], "expected_results": ["y"]}
    b = {"test_id": "TC_002", "title": "z", "steps": ["2"], "expected_results": ["w"]}
    assert svc.run_content_digest([a, b]) == svc.run_content_digest([b, a])
    assert svc.run_content_digest([a, b]) != svc.run_content_digest(
        [{**a, "title": "changed"}, b]
    )


def test_staleness_detected_when_approved_content_changes(db_session):
    run_id = _seed_run(db_session, n=1)
    _approve_all(db_session, run_id)
    svc.approve_run(db_session, run_id, "a@x", "Alice")
    assert svc.get_run_governance(db_session, run_id)["stale"] is False
    # Mutate persisted content directly (bypassing the lock) → digest drifts.
    tc = db_session.query(TCDB).filter(TCDB.run_id == run_id).first()
    tc.title = "tampered after sign-off"
    db_session.commit()
    assert svc.get_run_governance(db_session, run_id)["stale"] is True


# ── API: identity, 409 lock, approval-gated export + manifest ─────────────────

def _login(client, email=None, name=None):
    res = client.post("/auth/login", json={"password": APP_PASSWORD, "email": email, "name": name})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}, res.json()


def test_login_embeds_identity_and_review_attributes_to_it(client):
    headers, body = _login(client, email="carol@x.com", name="Carol")
    assert body["actor_id"] == "carol@x.com"
    assert body["actor_display"] == "Carol"

    s = SessionLocal()
    try:
        run_id = _seed_run(s, n=1)
        tc = svc.get_test_cases_for_run(s, run_id)[0]
    finally:
        s.close()

    r = client.patch(f"/runs/{run_id}/test-cases/{tc.test_id}/review",
                     json={"review_status": "approved"}, headers=headers)
    assert r.status_code == 200
    evs = client.get(f"/runs/{run_id}/review/events", headers=headers).json()["events"]
    assert evs[0]["actor_display"] == "Carol"
    assert evs[0]["actor_id"] == "carol@x.com"


def test_locked_run_returns_409_via_api(client):
    headers, _ = _login(client, email="d@x.com", name="Dan")
    s = SessionLocal()
    try:
        run_id = _seed_run(s, n=1)
        tc_id = svc.get_test_cases_for_run(s, run_id)[0].test_id
    finally:
        s.close()
    client.patch(f"/runs/{run_id}/test-cases/{tc_id}/review",
                 json={"review_status": "approved"}, headers=headers)
    client.post(f"/runs/{run_id}/approve", json={}, headers=headers)
    # Writing to the now-locked run → 409.
    r = client.patch(f"/runs/{run_id}/test-cases/{tc_id}/review",
                     json={"review_status": "rejected"}, headers=headers)
    assert r.status_code == 409


def test_approved_export_gated_then_allowed_with_manifest(client):
    headers, _ = _login(client, email="erin@x.com", name="Erin")
    s = SessionLocal()
    try:
        run_id = _seed_run(s, n=2)
        tc_ids = [tc.test_id for tc in svc.get_test_cases_for_run(s, run_id)]
    finally:
        s.close()

    # Before sign-off: approved export is refused.
    r = client.get(f"/runs/{run_id}/export/csv?status=approved", headers=headers)
    assert r.headers["content-type"].startswith("application/json")
    assert "not approved" in r.json()["error"].lower()

    # Approve every case, then sign off.
    for tid in tc_ids:
        client.patch(f"/runs/{run_id}/test-cases/{tid}/review",
                     json={"review_status": "approved"}, headers=headers)
    gov = client.post(f"/runs/{run_id}/approve", json={"note": "release"}, headers=headers).json()
    assert gov["review_state"] == "approved"

    # Now the approved artifact exports, carrying the provenance manifest + reviewer.
    r = client.get(f"/runs/{run_id}/export/csv?status=approved", headers=headers)
    assert r.headers["content-type"].startswith("text/csv")
    body = r.text
    assert "# Review State: approved" in body
    assert "Erin" in body  # reviewer in manifest and/or per-case column

    events = client.get(f"/runs/{run_id}/approval/events", headers=headers).json()["events"]
    assert events[0]["to_state"] == "approved"
    assert events[0]["actor_display"] == "Erin"
