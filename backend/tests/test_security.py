"""Phase 5 — security hardening: config fail-closed, login rate limiting,
upload hardening, security headers."""

import io

import pytest

import config

APP_PASSWORD = "test-pass"


# ── Config validation / fail-closed secrets ───────────────────────────────────

def test_problems_flags_dev_defaults(monkeypatch):
    monkeypatch.setenv("APP_PASSWORD", "autotest-demo")
    monkeypatch.setenv("AUTH_SECRET", "dev-insecure-auth-secret-change-me")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./x.db")
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    probs = config._problems()
    assert any("APP_PASSWORD" in p for p in probs)
    assert any("AUTH_SECRET" in p for p in probs)
    assert any("DATABASE_URL" in p for p in probs)
    assert any("ALLOWED_ORIGINS" in p for p in probs)


def test_validate_fails_closed_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_PASSWORD", "")  # missing → must refuse to boot
    with pytest.raises(RuntimeError):
        config.validate_config()


def test_validate_warns_only_in_development(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("APP_PASSWORD", "")
    config.validate_config()  # must NOT raise in development


# ── Login rate limiting / lockout ─────────────────────────────────────────────

def test_login_lockout_after_repeated_failures(client, monkeypatch):
    monkeypatch.setattr(config, "LOGIN_MAX_ATTEMPTS", 3)
    monkeypatch.setattr(config, "LOGIN_LOCKOUT_SECONDS", 60)
    # Unique IP so this lockout can't poison the default login bucket other tests use.
    hdr = {"X-Forwarded-For": "203.0.113.7"}

    for _ in range(3):
        r = client.post("/auth/login", json={"password": "wrong"}, headers=hdr)
        assert r.status_code == 401
    # Now locked out — even a correct password is refused with 429 + Retry-After.
    r = client.post("/auth/login", json={"password": APP_PASSWORD}, headers=hdr)
    assert r.status_code == 429
    assert "retry-after" in {k.lower() for k in r.headers}


def test_successful_login_unaffected_on_clean_ip(client):
    r = client.post("/auth/login", json={"password": APP_PASSWORD},
                    headers={"X-Forwarded-For": "203.0.113.250"})
    assert r.status_code == 200
    assert r.json()["token"]


# ── Security headers ──────────────────────────────────────────────────────────

def test_security_headers_present(client):
    r = client.get("/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert "Content-Security-Policy" in r.headers
    # Auth responses must not be cached.
    a = client.post("/auth/login", json={"password": APP_PASSWORD},
                    headers={"X-Forwarded-For": "203.0.113.251"})
    assert a.headers.get("Cache-Control") == "no-store"


# ── Upload hardening ──────────────────────────────────────────────────────────

def test_upload_rejects_oversized(client, auth, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 16)
    r = client.post("/upload",
                    files={"file": ("big.txt", io.BytesIO(b"x" * 5000), "text/plain")},
                    headers=auth)
    assert "limit" in (r.json().get("error", "").lower())


def test_upload_rejects_content_extension_mismatch(client, auth):
    # A ".pdf" whose bytes are not a PDF → rejected by content sniffing.
    r = client.post("/upload",
                    files={"file": ("fake.pdf", io.BytesIO(b"not a real pdf"), "application/pdf")},
                    headers=auth)
    assert "does not match" in (r.json().get("error", "").lower())


def test_upload_sanitizes_traversal_filename(client, auth):
    # A path-traversal filename must not escape — response shows only the basename
    # and the request succeeds (the temp file is server-named and deleted).
    content = b"REQ-1: the system shall do X\nREQ-2: the system shall do Y\n"
    r = client.post("/upload",
                    files={"file": ("../../../etc/evil.txt", io.BytesIO(content), "text/plain")},
                    headers=auth)
    body = r.json()
    assert body.get("error") is None, body
    assert body["filename"] == "evil.txt"  # basename only, no path
