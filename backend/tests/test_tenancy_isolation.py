"""Phase 4.5 tenancy sweep — IDOR isolation across EVERY resource type.

Two real OAuth users in two organizations. Every data endpoint that references an
Org-A object must be denied (404 — no existence leak) to an Org-B session, and
allowed to the Org-A session. Provider keys are org-isolated.
"""

import uuid

import pytest

from database import SessionLocal
from db_models import ProviderKey
from auth.security import issue_session_token
from services import db_service as svc
from services import identity, jobs as job_queue
from services import lifecycle
from services.secrets import encrypt_secret


def _session(db, name):
    u = identity.upsert_user_from_oauth(
        db, provider="google", subject="g-" + uuid.uuid4().hex,
        email=f"{name}-{uuid.uuid4().hex[:6]}@x.com", name=name, avatar=None, email_verified=True)
    org = identity.ensure_personal_org(db, u)
    sess = identity.create_session(db, u, org)
    token = issue_session_token(sess.id, u.id, org.id)
    return {"Authorization": f"Bearer {token}"}, org, u


@pytest.fixture
def two_orgs():
    """Build Org A (with a full object graph) and an empty Org B; return their
    auth headers + Org-A object ids."""
    db = SessionLocal()
    try:
        hdr_a, org_a, ua = _session(db, "Alice")
        hdr_b, org_b, ub = _session(db, "Bob")

        # Org A object graph: project → run (+ cases) → catalog → baseline → key.
        proj = svc.create_project(db, name="A Project", organization_id=org_a.id, created_by_user_id=ua.id)
        run_id = str(uuid.uuid4())
        svc.create_run(db, job_id=run_id, project_id=proj.id,
                       requirements=["REQ-A-1: the system shall do X"],
                       provider="fake", model="m", prompt_version="v1",
                       parsed_meta={"REQ-A-1: the system shall do X": {"requirement_id": "REQ-A-1", "statement": "the system shall do X"}})
        svc.finalize_run(db, run_id, [{
            "test_id": "TC_001", "requirement_id": "REQ-A-1", "title": "t", "asil": "QM",
            "test_type": "functional", "steps": ["s"], "expected_results": ["e"],
            "source_requirement_text": "REQ-A-1: the system shall do X",
        }], rag_enabled=False, outcome="complete")
        job_queue.enqueue(db, run_id, total=1)
        bl = lifecycle.create_baseline(db, proj.id, "1.0", None, ua.primary_email, "Alice")
        db.add(ProviderKey(provider="anthropic", api_key=encrypt_secret("sk-A"), organization_id=org_a.id))
        db.commit()

        ids = {"project": proj.id, "run": run_id, "baseline": bl["id"], "key_provider": "anthropic"}
        return hdr_a, hdr_b, ids
    finally:
        db.close()


# Endpoints that reference an Org-A object → must be 404 for Org B, 200/ok for A.
def _project_routes(pid):
    return [
        ("get", f"/projects/{pid}"),
        ("get", f"/projects/{pid}/runs"),
        ("get", f"/projects/{pid}/stats"),
        ("get", f"/projects/{pid}/requirements"),
        ("get", f"/projects/{pid}/coverage"),
        ("get", f"/projects/{pid}/catalog"),
        ("get", f"/projects/{pid}/catalog/REQ-A-1"),
        ("get", f"/projects/{pid}/baselines"),
    ]


def _run_routes(rid):
    return [
        ("get", f"/runs/{rid}"),
        ("get", f"/runs/{rid}/test-cases"),
        ("get", f"/runs/{rid}/governance"),
        ("get", f"/runs/{rid}/approval/events"),
        ("get", f"/runs/{rid}/review/summary"),
        ("get", f"/runs/{rid}/review/events"),
        ("get", f"/runs/{rid}/requirements"),
        ("get", f"/runs/{rid}/traceability"),
        ("get", f"/runs/{rid}/validation"),
        ("get", f"/runs/{rid}/export/excel"),
        ("get", f"/runs/{rid}/export/csv"),
        ("get", f"/jobs/{rid}"),
    ]


def test_org_b_denied_all_org_a_projects(client, two_orgs):
    _hdr_a, hdr_b, ids = two_orgs
    for method, path in _project_routes(ids["project"]):
        r = client.request(method, path, headers=hdr_b)
        assert r.status_code == 404, f"IDOR: {method} {path} returned {r.status_code} for Org B"


def test_org_b_denied_all_org_a_runs_and_jobs(client, two_orgs):
    _hdr_a, hdr_b, ids = two_orgs
    for method, path in _run_routes(ids["run"]):
        r = client.request(method, path, headers=hdr_b)
        assert r.status_code == 404, f"IDOR: {method} {path} returned {r.status_code} for Org B"


def test_org_b_denied_org_a_writes(client, two_orgs):
    _hdr_a, hdr_b, ids = two_orgs
    pid, rid = ids["project"], ids["run"]
    writes = [
        ("patch", f"/projects/{pid}", {"name": "hax"}),
        ("delete", f"/projects/{pid}", None),
        ("post", f"/projects/{pid}/catalog/REQ-A-1/revise", {"statement": "hax"}),
        ("post", f"/projects/{pid}/baselines", {"name": "evil"}),
        ("patch", f"/runs/{rid}/test-cases/TC_001/review", {"review_status": "approved"}),
        ("post", f"/runs/{rid}/approve", {}),
        ("post", f"/runs/{rid}/reject", {}),
        ("post", f"/runs/{rid}/reopen", {}),
        ("post", f"/jobs/{rid}/cancel", {}),
    ]
    for method, path, body in writes:
        r = client.request(method, path, json=body, headers=hdr_b)
        assert r.status_code == 404, f"IDOR write: {method} {path} returned {r.status_code} for Org B"


def test_org_b_denied_org_a_baseline(client, two_orgs):
    _hdr_a, hdr_b, ids = two_orgs
    for path in (f"/baselines/{ids['baseline']}", f"/baselines/{ids['baseline']}/export/excel"):
        r = client.get(path, headers=hdr_b)
        assert r.status_code == 404, f"IDOR baseline: {path} returned {r.status_code}"


def test_provider_keys_are_org_isolated(client, two_orgs):
    _hdr_a, hdr_b, _ids = two_orgs
    # Org B sees none of Org A's keys.
    keys_b = client.get("/providers/keys", headers=hdr_b).json()
    assert all(k["provider"] != "anthropic" or not k["has_key"] for k in keys_b)
    assert len(keys_b) == 0


def test_org_a_can_access_its_own_resources(client, two_orgs):
    hdr_a, _hdr_b, ids = two_orgs
    assert client.get(f"/projects/{ids['project']}", headers=hdr_a).status_code == 200
    assert client.get(f"/runs/{ids['run']}", headers=hdr_a).status_code == 200
    assert client.get(f"/baselines/{ids['baseline']}", headers=hdr_a).status_code == 200
    # Org A's project appears in A's list; Org B's does not see it.
    a_projects = client.get("/projects", headers=hdr_a).json()
    assert any(p["id"] == ids["project"] for p in a_projects)


def test_org_b_project_list_excludes_org_a(client, two_orgs):
    _hdr_a, hdr_b, ids = two_orgs
    b_projects = client.get("/projects", headers=hdr_b).json()
    assert all(p["id"] != ids["project"] for p in b_projects)
