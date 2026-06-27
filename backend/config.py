"""Centralised configuration + fail-closed validation (Phase 5).

A single place that reads environment config and, in production, **refuses to
boot** when security-critical settings are missing or left at insecure dev
defaults. In development it only warns, so local work stays frictionless.

``APP_ENV`` selects the mode (``development`` default; set ``production`` on
deploy). No new dependency — plain ``os.getenv`` + explicit checks.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Known insecure dev fallbacks that must never appear in production.
_DEV_PASSWORD = "autotest-demo"
_DEV_AUTH_SECRET = "dev-insecure-auth-secret-change-me"
_DEV_ENC_SECRET = "dev-insecure-key-encryption-secret-change-me"
_MIN_SECRET_LEN = 16

# Upload hardening limits.
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))  # 10 MB
MAX_REQUIREMENTS = int(os.getenv("MAX_REQUIREMENTS", "2000"))

# Login rate-limit envelope (DB-backed; multi-instance safe).
LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "10"))
LOGIN_WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "300"))
LOGIN_LOCKOUT_SECONDS = int(os.getenv("LOGIN_LOCKOUT_SECONDS", "900"))

# ── Identity / multi-tenant (Phase 4.5) ───────────────────────────────────────
# Keep the legacy shared-password login working during the OAuth transition.
LEGACY_PASSWORD_AUTH = os.getenv("LEGACY_PASSWORD_AUTH", "true").strip().lower() != "false"
# Public base URL used to build OAuth redirect URIs.
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000").rstrip("/")
# Frontend URL the OAuth callback redirects back to with the session token.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def oauth_provider_config(provider: str) -> dict | None:
    """Return ``{client_id, client_secret}`` for a provider if both are set."""
    p = provider.upper()
    cid = os.getenv(f"{p}_CLIENT_ID")
    secret = os.getenv(f"{p}_CLIENT_SECRET")
    if cid and secret:
        return {"client_id": cid, "client_secret": secret}
    return None


def app_env() -> str:
    return os.getenv("APP_ENV", "development").strip().lower()


def is_production() -> bool:
    return app_env() == "production"


def _problems() -> list[str]:
    """Collect security-critical misconfigurations (evaluated for production)."""
    problems: list[str] = []

    pw = os.getenv("APP_PASSWORD")
    if not pw or pw == _DEV_PASSWORD:
        problems.append("APP_PASSWORD is unset or using the insecure dev default.")

    auth = os.getenv("AUTH_SECRET")
    if not auth or auth == _DEV_AUTH_SECRET:
        problems.append("AUTH_SECRET is unset or using the insecure dev default.")
    elif len(auth) < _MIN_SECRET_LEN:
        problems.append(f"AUTH_SECRET is too short (min {_MIN_SECRET_LEN} chars).")

    enc = os.getenv("KEY_ENCRYPTION_SECRET")
    if not enc or enc == _DEV_ENC_SECRET:
        problems.append("KEY_ENCRYPTION_SECRET is unset or using the insecure dev default.")
    elif len(enc) < _MIN_SECRET_LEN:
        problems.append(f"KEY_ENCRYPTION_SECRET is too short (min {_MIN_SECRET_LEN} chars).")

    db = os.getenv("DATABASE_URL", "")
    if not db or db.startswith("sqlite"):
        problems.append("DATABASE_URL must be a non-ephemeral (PostgreSQL) URL in production.")

    origins = os.getenv("ALLOWED_ORIGINS", "")
    if not origins.strip() or "*" in origins:
        problems.append("ALLOWED_ORIGINS must be an explicit, non-wildcard origin list in production.")

    return problems


def validate_config() -> None:
    """Validate config at boot. In production, raise (fail closed) on any problem;
    in development, log warnings only."""
    problems = _problems()
    if not problems:
        logger.info("Config validation passed (env=%s).", app_env())
        return
    summary = "\n  - ".join(problems)
    if is_production():
        raise RuntimeError(
            "Refusing to start in production with insecure configuration:\n  - " + summary
        )
    logger.warning(
        "Insecure configuration detected (env=%s — allowed in development only):\n  - %s",
        app_env(), summary,
    )
