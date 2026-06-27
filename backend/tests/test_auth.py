"""Single-tenant auth gate — token mechanics and route protection."""

from auth.security import issue_token, validate_token, verify_password


# ── Unit: token + password ────────────────────────────────────────────────────

def test_verify_password():
    assert verify_password("test-pass") is True
    assert verify_password("wrong") is False
    assert verify_password("") is False
    assert verify_password(None) is False


def test_token_issue_and_validate():
    t = issue_token()
    assert validate_token(t) is True


def test_validate_rejects_bad_tokens():
    assert validate_token(None) is False
    assert validate_token("") is False
    assert validate_token("garbage.token.value") is False


def test_expired_token_rejected():
    t = issue_token(ttl_hours=-1)  # already expired
    assert validate_token(t) is False


# ── Integration: endpoints + middleware ───────────────────────────────────────

def test_health_is_public(client):
    assert client.get("/health").status_code == 200


def test_login_wrong_password(client):
    assert client.post("/auth/login", json={"password": "nope"}).status_code == 401


def test_login_success_returns_token(client):
    res = client.post("/auth/login", json={"password": "test-pass"})
    assert res.status_code == 200
    body = res.json()
    assert body["token"] and body["token_type"] == "bearer"


def test_protected_route_requires_token(client):
    assert client.get("/projects").status_code == 401


def test_protected_route_with_token(client, auth):
    assert client.get("/projects", headers=auth).status_code == 200


def test_me_requires_token(client, auth):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers=auth).status_code == 200


def test_sse_style_query_token_accepted(client, token):
    # The gate must accept a token via ?token= (EventSource cannot set headers).
    res = client.get(f"/projects?token={token}")
    assert res.status_code != 401
