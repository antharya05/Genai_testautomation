"""Phase 4.5 — identity, OAuth, RBAC, sessions, tenancy isolation."""

import uuid
from urllib.parse import parse_qs, urlparse

from database import SessionLocal
from auth import oauth, roles
from auth.principal import authorize_project, principal_from_token
from auth.security import issue_session_token, issue_token
from services import identity

APP_PASSWORD = "test-pass"


def _email():
    return f"u-{uuid.uuid4().hex[:8]}@example.com"


# ── RBAC matrix ───────────────────────────────────────────────────────────────

def test_rbac_permission_matrix():
    assert roles.has_permission(roles.OWNER, roles.P_MANAGE_ORG)
    assert roles.has_permission(roles.REVIEWER, roles.P_REVIEW)
    assert not roles.has_permission(roles.REVIEWER, roles.P_MANAGE_ORG)
    assert roles.has_permission(roles.MEMBER, roles.P_WRITE_PROJECT)
    assert not roles.has_permission(roles.MEMBER, roles.P_REVIEW)
    assert roles.has_permission(roles.VIEWER, roles.P_READ)
    assert not roles.has_permission(roles.VIEWER, roles.P_WRITE_PROJECT)


# ── OAuth user upsert + linking ───────────────────────────────────────────────

def test_oauth_upsert_links_verified_email_across_providers():
    db = SessionLocal()
    try:
        email = _email()
        u1 = identity.upsert_user_from_oauth(db, provider="google", subject="g-" + uuid.uuid4().hex,
                                             email=email, name="U", avatar=None, email_verified=True)
        # Same verified email via GitHub → links to the SAME user.
        u2 = identity.upsert_user_from_oauth(db, provider="github", subject="gh-" + uuid.uuid4().hex,
                                             email=email, name="U", avatar=None, email_verified=True)
        assert u1.id == u2.id
    finally:
        db.close()


def test_oauth_unverified_email_does_not_link():
    db = SessionLocal()
    try:
        email = _email()
        u1 = identity.upsert_user_from_oauth(db, provider="google", subject="g-" + uuid.uuid4().hex,
                                             email=email, name="U", avatar=None, email_verified=True)
        # Unverified email from another provider → must NOT take over the account.
        u2 = identity.upsert_user_from_oauth(db, provider="microsoft", subject="ms-" + uuid.uuid4().hex,
                                             email=email, name="U", avatar=None, email_verified=False)
        assert u1.id != u2.id
    finally:
        db.close()


# ── Sessions ──────────────────────────────────────────────────────────────────

def test_session_create_resolve_revoke():
    db = SessionLocal()
    try:
        user = identity.upsert_user_from_oauth(db, provider="google", subject="g-" + uuid.uuid4().hex,
                                               email=_email(), name="S", avatar=None, email_verified=True)
        org = identity.ensure_personal_org(db, user)
        sess = identity.create_session(db, user, org)
        assert identity.resolve_session(db, sess.id) is not None
        identity.revoke_session(db, sess.id)
        assert identity.resolve_session(db, sess.id) is None
    finally:
        db.close()


def test_switch_org_requires_membership():
    db = SessionLocal()
    try:
        user = identity.upsert_user_from_oauth(db, provider="google", subject="g-" + uuid.uuid4().hex,
                                               email=_email(), name="S", avatar=None, email_verified=True)
        org = identity.ensure_personal_org(db, user)
        sess = identity.create_session(db, user, org)
        # Another org the user is NOT a member of.
        other_owner = identity.upsert_user_from_oauth(db, provider="google", subject="g-" + uuid.uuid4().hex,
                                                      email=_email(), name="O", avatar=None, email_verified=True)
        other_org = identity.create_organization(db, "Other", other_owner)
        assert identity.switch_org(db, sess.id, other_org.id) is False
        assert identity.switch_org(db, sess.id, org.id) is True
    finally:
        db.close()


# ── Tenancy isolation (IDOR) ──────────────────────────────────────────────────

def test_session_principal_cannot_access_other_org_project():
    from services import db_service as svc
    db = SessionLocal()
    try:
        # User A in Org A, with a project in Org A.
        ua = identity.upsert_user_from_oauth(db, provider="google", subject="g-" + uuid.uuid4().hex,
                                             email=_email(), name="A", avatar=None, email_verified=True)
        oa = identity.ensure_personal_org(db, ua)
        proj_a = svc.create_project(db, name="A proj")
        proj_a.organization_id = oa.id
        db.commit()

        # User B in their own Org B.
        ub = identity.upsert_user_from_oauth(db, provider="google", subject="g-" + uuid.uuid4().hex,
                                             email=_email(), name="B", avatar=None, email_verified=True)
        ob = identity.ensure_personal_org(db, ub)
        sess_b = identity.create_session(db, ub, ob)
        token_b = issue_session_token(sess_b.id, ub.id, ob.id)

        p_b = principal_from_token(db, token_b)
        assert p_b is not None and p_b.is_legacy is False
        # B must be denied A's project (404, not leaking existence).
        import pytest
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            authorize_project(db, p_b, proj_a.id, roles.P_READ)
        assert exc.value.status_code == 404
    finally:
        db.close()


def test_legacy_principal_has_full_access():
    db = SessionLocal()
    try:
        # Legacy shared-password token → operator with default-org, full access.
        token = issue_token(actor_id="op@x.com", actor_display="Op")
        p = principal_from_token(db, token)
        assert p is not None and p.is_legacy is True
        assert p.can(roles.P_MANAGE_ORG) is True
    finally:
        db.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────

def test_providers_endpoint_public(client):
    r = client.get("/auth/providers")
    assert r.status_code == 200
    assert "oauth" in r.json() and "legacy_password" in r.json()


def test_oauth_end_to_end_creates_session(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    email = _email()
    monkeypatch.setattr(oauth, "fetch_identity",
                        lambda provider, code, verifier: {
                            "sub": "g-" + uuid.uuid4().hex, "email": email,
                            "name": "OAuth User", "avatar": None, "email_verified": True})

    start = client.get("/auth/oauth/google/start", follow_redirects=False)
    assert start.status_code == 302
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]

    cb = client.get(f"/auth/oauth/google/callback?code=abc&state={state}", follow_redirects=False)
    assert cb.status_code == 302
    token = cb.headers["location"].split("#token=", 1)[1]

    sess = client.get("/auth/session", headers={"Authorization": f"Bearer {token}"})
    body = sess.json()
    assert body["authenticated"] is True
    assert body["user"]["email"] == email
    assert body["is_legacy"] is False
    assert len(body["orgs"]) >= 1

    # Logout revokes the session → token no longer authenticates.
    client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    again = client.get("/auth/session", headers={"Authorization": f"Bearer {token}"})
    assert again.status_code == 401


# ── Backfill ──────────────────────────────────────────────────────────────────

def test_backfill_default_org_idempotent(client):
    # The client fixture's lifespan already ran the backfill; the Default Org
    # exists and the default project is assigned.
    db = SessionLocal()
    try:
        from db_models import Organization, Project
        org = db.query(Organization).filter(Organization.slug == "default-org").first()
        assert org is not None
        default_project = db.get(Project, svc_default_id())
        assert default_project.organization_id == org.id
        # Idempotent: a fresh run links nothing.
        assert identity.backfill_default_org(db) == 0
    finally:
        db.close()


def svc_default_id():
    from services.db_service import DEFAULT_PROJECT_ID
    return DEFAULT_PROJECT_ID
