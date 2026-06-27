"""ProviderManager strict-BYOK resolution + at-rest key encryption."""

import pytest

from db_models import AppConfig, ProviderKey
from providers import ProviderError, provider_manager
from services.secrets import decrypt_secret, encrypt_secret, is_encrypted


def _upsert_config(db, key, value):
    row = db.query(AppConfig).filter(AppConfig.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppConfig(key=key, value=value))
    db.commit()


def _set_key(db, provider, api_key):
    db.query(ProviderKey).filter(ProviderKey.provider == provider).delete()
    db.add(ProviderKey(provider=provider, api_key=encrypt_secret(api_key)))
    db.commit()


def _cleanup(db, provider):
    db.query(ProviderKey).filter(ProviderKey.provider == provider).delete()
    db.commit()


def test_registry_has_all_five_providers():
    assert set(provider_manager.REGISTRY) == {"anthropic", "openai", "groq", "gemini", "ollama"}


def test_credential_decrypts_stored_key(db_session):
    _set_key(db_session, "openai", "sk-secret-123")
    key, endpoint = provider_manager._credential(db_session, "openai")
    assert key == "sk-secret-123"
    assert endpoint is None
    _cleanup(db_session, "openai")


def test_get_active_config_uses_default_model(db_session):
    _upsert_config(db_session, "active_provider", "groq")
    db_session.query(AppConfig).filter(AppConfig.key == "active_model").delete()
    db_session.commit()
    provider, model = provider_manager.get_active_config(db_session)
    assert provider == "groq"
    assert model == "llama-3.3-70b-versatile"


def test_missing_key_raises_provider_error(db_session):
    _upsert_config(db_session, "active_provider", "gemini")
    _cleanup(db_session, "gemini")  # ensure no key
    with pytest.raises(ProviderError):
        provider_manager.get_active_provider(db_session)


def test_metrics_record_and_read():
    provider_manager.record_usage("fake-metrics", latency_ms=12.0, success=True,
                                  tokens_in=5, tokens_out=7)
    metrics = {m["provider"]: m for m in provider_manager.get_metrics()}
    assert "fake-metrics" in metrics
    assert metrics["fake-metrics"]["requests"] >= 1


# ── Secrets-at-rest ──────────────────────────────────────────────────────────

def test_encrypt_decrypt_roundtrip():
    ct = encrypt_secret("sk-ant-xyz")
    assert is_encrypted(ct) and "sk-ant-xyz" not in ct
    assert decrypt_secret(ct) == "sk-ant-xyz"


def test_legacy_plaintext_passthrough():
    assert decrypt_secret("legacy-plaintext") == "legacy-plaintext"
    assert is_encrypted("legacy-plaintext") is False


def test_encrypt_none_and_no_double_wrap():
    assert encrypt_secret(None) is None
    ct = encrypt_secret("x")
    assert encrypt_secret(ct) == ct  # already-encrypted value not re-wrapped
