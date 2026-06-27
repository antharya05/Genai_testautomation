"""Endpoint protection coverage + provider-key API roundtrip (encryption path)."""

import pytest


@pytest.mark.parametrize("method, path", [
    ("post", "/upload"),
    ("post", "/parse-text"),
    ("post", "/generate"),
    ("get", "/runs/abc"),
    ("get", "/runs/abc/test-cases"),
    ("post", "/export/excel"),
    ("post", "/export/csv"),
    ("get", "/providers/keys"),
    ("post", "/providers/keys"),
    ("get", "/providers/active"),
    ("get", "/cache/stats"),
])
def test_endpoints_require_auth(client, method, path):
    res = getattr(client, method)(path)
    assert res.status_code == 401, f"{method.upper()} {path} not protected ({res.status_code})"


def test_provider_key_roundtrip_is_encrypted(client, auth):
    import db_models
    from database import SessionLocal
    from services.secrets import is_encrypted

    # Save a key through the API.
    res = client.post("/providers/keys",
                      json={"provider": "openai", "api_key": "sk-roundtrip-123",
                            "model": "gpt-4o-mini"}, headers=auth)
    assert res.status_code == 200

    # Stored ciphertext, never plaintext.
    db = SessionLocal()
    try:
        pk = db.query(db_models.ProviderKey).filter_by(provider="openai").first()
        assert pk is not None and is_encrypted(pk.api_key)
        assert "sk-roundtrip-123" not in pk.api_key
    finally:
        db.close()

    # List endpoint exposes only has_key, never the secret.
    listed = client.get("/providers/keys", headers=auth).json()
    row = next(r for r in listed if r["provider"] == "openai")
    assert row["has_key"] is True
    assert "api_key" not in row


def test_cache_stats_with_auth(client, auth):
    res = client.get("/cache/stats", headers=auth)
    assert res.status_code == 200
