"""Email/password identity (Phase 4.6).

Covers registration, hashing, uniqueness, email login (+ legacy fallback),
forgot/reset, email verification, and OAuth↔email coexistence. Uses unique
emails per test since the suite shares one DB across the session.
"""

import uuid
from urllib.parse import parse_qs, urlparse

from auth.security import verify_user_password


def _email() -> str:
    return f"u-{uuid.uuid4().hex[:12]}@example.com"


def _register(client, email=None, password="Password123", name="Test User"):
    email = email or _email()
    res = client.post("/auth/register", json={"email": email, "password": password, "name": name})
    return email, res


# ─── Registration ─────────────────────────────────────────────

def test_register_creates_user_and_signs_in(client):
    email, res = _register(client)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token"]
    assert body["user"]["email"] == email
    assert body["user"]["email_verified"] is False
    # The returned session token authenticates immediately.
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200 and me.json()["authenticated"] is True


def test_register_creates_personal_org_with_owner_role(client):
    _, res = _register(client)
    token = res.json()["token"]
    session = client.get("/auth/session", headers={"Authorization": f"Bearer {token}"})
    assert session.status_code == 200, session.text
    data = session.json()
    assert data["role"] == "owner"
    assert len(data["orgs"]) == 1 and data["orgs"][0]["role"] == "owner"
    assert data["active_org_id"]


def test_password_is_hashed_not_stored_plaintext(client, db_session):
    from services import identity
    email, res = _register(client, password="Sup3rSecret!")
    assert res.status_code == 200
    user = identity.get_user_by_email(db_session, email)
    assert user.password_hash and user.password_hash.startswith("pbkdf2_sha256$")
    assert "Sup3rSecret!" not in user.password_hash
    assert verify_user_password("Sup3rSecret!", user.password_hash) is True
    assert verify_user_password("wrong", user.password_hash) is False


def test_duplicate_email_rejected(client):
    email, first = _register(client)
    assert first.status_code == 200
    _, second = _register(client, email=email)
    assert second.status_code == 409
    assert "already" in second.json()["detail"].lower()


def test_register_rejects_invalid_email(client):
    res = client.post("/auth/register", json={"email": "not-an-email", "password": "Password123"})
    assert res.status_code == 422


def test_register_rejects_weak_password(client):
    res = client.post("/auth/register", json={"email": _email(), "password": "short"})
    assert res.status_code == 422
    res2 = client.post("/auth/register", json={"email": _email(), "password": "alllettersnodigits"})
    assert res2.status_code == 422


# ─── Email login ──────────────────────────────────────────────

def test_login_email_success(client):
    email, reg = _register(client, password="Password123")
    assert reg.status_code == 200
    res = client.post("/auth/login/email", json={"email": email, "password": "Password123"})
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_login_email_wrong_password(client):
    email, reg = _register(client, password="Password123")
    assert reg.status_code == 200
    res = client.post("/auth/login/email", json={"email": email, "password": "WrongPassword1"})
    assert res.status_code == 401


def test_login_email_falls_back_to_legacy_shared_password(client):
    # The legacy operator password keeps working through the email-login form.
    res = client.post("/auth/login/email", json={"email": "operator@example.com", "password": "test-pass"})
    assert res.status_code == 200, res.text
    assert res.json().get("legacy") is True


def test_legacy_login_endpoint_unchanged(client):
    res = client.post("/auth/login", json={"password": "test-pass"})
    assert res.status_code == 200 and res.json()["token"]


# ─── Forgot / reset ───────────────────────────────────────────

def test_forgot_password_no_enumeration(client):
    # Unknown email still returns ok, without a reset link.
    res = client.post("/auth/password/forgot", json={"email": _email()})
    assert res.status_code == 200 and res.json()["ok"] is True
    assert "reset_token" not in res.json()


def test_reset_password_flow_and_single_use(client):
    email, reg = _register(client, password="OldPassword1")
    assert reg.status_code == 200

    forgot = client.post("/auth/password/forgot", json={"email": email})
    assert forgot.status_code == 200
    token = forgot.json()["reset_token"]  # dev-only convenience

    reset = client.post("/auth/password/reset", json={"token": token, "password": "NewPassword2"})
    assert reset.status_code == 200, reset.text
    assert reset.json()["ok"] is True and reset.json()["token"]

    # New password works, old one doesn't.
    assert client.post("/auth/login/email", json={"email": email, "password": "NewPassword2"}).status_code == 200
    assert client.post("/auth/login/email", json={"email": email, "password": "OldPassword1"}).status_code == 401

    # The reset token is single-use (fingerprint changed after the reset).
    replay = client.post("/auth/password/reset", json={"token": token, "password": "Another3Pass"})
    assert replay.status_code == 400


def test_reset_password_rejects_bad_token(client):
    res = client.post("/auth/password/reset", json={"token": "garbage", "password": "NewPassword2"})
    assert res.status_code == 400


# ─── Email verification ───────────────────────────────────────

def test_verify_email_flow(client, db_session):
    from services import identity
    email, reg = _register(client)
    assert reg.status_code == 200
    verify_url = reg.json()["verify_url"]
    token = parse_qs(urlparse(verify_url).query)["token"][0]

    user = identity.get_user_by_email(db_session, email)
    assert user.email_verified is False

    res = client.post("/auth/verify-email", json={"token": token})
    assert res.status_code == 200 and res.json()["ok"] is True

    db_session.expire_all()
    user = identity.get_user_by_email(db_session, email)
    assert user.email_verified is True


# ─── Coexistence with OAuth ───────────────────────────────────

def test_oauth_and_email_users_coexist(client, db_session):
    from services import identity
    # An OAuth user (verified email) created the old way.
    oauth_email = _email()
    oauth_user = identity.upsert_user_from_oauth(
        db_session, provider="github", subject=uuid.uuid4().hex,
        email=oauth_email, name="OAuth User", avatar=None, email_verified=True,
    )
    assert oauth_user.password_hash is None  # OAuth users have no password

    # A separate email/password user.
    email, reg = _register(client)
    assert reg.status_code == 200
    assert email != oauth_email

    # Both resolve independently; the OAuth user is unaffected.
    db_session.expire_all()
    assert identity.get_user_by_email(db_session, oauth_email).id == oauth_user.id
    assert identity.get_user_by_email(db_session, email).password_hash.startswith("pbkdf2_sha256$")

    # Registering with the OAuth user's (verified) email is rejected as a duplicate.
    dup = client.post("/auth/register", json={"email": oauth_email, "password": "Password123"})
    assert dup.status_code == 409
