"""Token issuing/validation + password verification for the single-tenant gate.

Tokens are Fernet-encrypted JSON payloads carrying an expiry. Fernet gives us
authenticated encryption with a built-in timestamp, so we get tamper-proof,
time-limited bearer tokens without adding a JWT dependency. The signing secret
is ``AUTH_SECRET`` (distinct from the provider-key encryption secret).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_DEV_PASSWORD = "autotest-demo"
_DEV_AUTH_SECRET = "dev-insecure-auth-secret-change-me"
TOKEN_TTL_HOURS = 12


def get_app_password() -> str:
    pw = os.getenv("APP_PASSWORD")
    if not pw:
        logger.warning(
            "APP_PASSWORD is not set — using the INSECURE dev password '%s'. "
            "Set APP_PASSWORD in production.", _DEV_PASSWORD,
        )
        return _DEV_PASSWORD
    return pw


def verify_password(candidate: str | None) -> bool:
    """Constant-time comparison against the configured app password."""
    if not candidate:
        return False
    return hmac.compare_digest(candidate, get_app_password())


# ─────────────────────────────────────────────
# Per-user password hashing (Phase 4.6)
# ─────────────────────────────────────────────
# PBKDF2-HMAC-SHA256 from the stdlib — no new dependency. Format:
#   pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
_PBKDF2_ALGO = "pbkdf2_sha256"
_PBKDF2_ITERATIONS = 240_000  # OWASP-recommended floor for PBKDF2-HMAC-SHA256


def hash_password(password: str) -> str:
    """Hash a plaintext password with a fresh random salt."""
    if not password:
        raise ValueError("password must not be empty")
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"{_PBKDF2_ALGO}${_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_user_password(password: str | None, stored: str | None) -> bool:
    """Constant-time verify a plaintext password against a stored hash."""
    if not password or not stored:
        return False
    try:
        algo, iters_s, salt_hex, hash_hex = stored.split("$", 3)
        if algo != _PBKDF2_ALGO:
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters_s)
        )
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


def _fernet() -> Fernet:
    secret = os.getenv("AUTH_SECRET")
    if not secret:
        logger.warning("AUTH_SECRET is not set — using an INSECURE dev fallback. Set it in production.")
        secret = _DEV_AUTH_SECRET
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def issue_token(
    ttl_hours: int = TOKEN_TTL_HOURS,
    actor_id: str | None = None,
    actor_display: str | None = None,
) -> str:
    """Issue a bearer token carrying the reviewer's identity.

    ``actor_id`` is the stable subject (the login email today; an OAuth ``sub`` in
    Phase 4.5) and ``actor_display`` the human label. They are embedded so the API
    can derive a *trusted* reviewer from the session instead of from a spoofable
    request body.
    """
    exp = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
    payload = json.dumps({
        "sub": actor_id or "app",
        "aid": actor_id,
        "adisp": actor_display,
        "exp": exp.isoformat(),
    }).encode("utf-8")
    return _fernet().encrypt(payload).decode("utf-8")


def issue_session_token(session_id: str, user_id: str, org_id: str | None,
                        ttl_hours: int = TOKEN_TTL_HOURS) -> str:
    """Issue a thin signed envelope for a server-side session (Phase 4.5).

    Carries only references (session id, user id, active org) — authority is the
    DB session row, validated on every request so revocation is immediate.
    """
    exp = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
    payload = json.dumps({
        "typ": "session", "sid": session_id, "uid": user_id, "org": org_id,
        "exp": exp.isoformat(),
    }).encode("utf-8")
    return _fernet().encrypt(payload).decode("utf-8")


def decode_token(token: str | None) -> dict | None:
    """Return the token payload iff valid and unexpired, else None."""
    if not token:
        return None
    try:
        data = json.loads(_fernet().decrypt(token.encode("utf-8")))
        exp = datetime.fromisoformat(data["exp"])
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= datetime.now(timezone.utc):
            return None
        return data
    except (InvalidToken, ValueError, KeyError, TypeError):
        return None


def validate_token(token: str | None) -> bool:
    """Return True iff ``token`` is a valid, unexpired token we issued."""
    return decode_token(token) is not None


def seal(payload: dict, ttl_seconds: int = 600) -> str:
    """Sign+encrypt a short-lived payload (e.g. the OAuth PKCE/state transaction)."""
    exp = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    data = {**payload, "exp": exp.isoformat()}
    return _fernet().encrypt(json.dumps(data).encode("utf-8")).decode("utf-8")


def unseal(token: str | None) -> dict | None:
    """Inverse of :func:`seal` (returns None if tampered/expired)."""
    return decode_token(token)


def actor_from_token(token: str | None) -> tuple[str | None, str]:
    """Resolve ``(actor_id, actor_display)`` from a token.

    Falls back to ``(None, "Operator")`` for legacy tokens with no identity, so
    governance writes always have a display value.
    """
    data = decode_token(token) or {}
    actor_id = data.get("aid")
    actor_display = data.get("adisp") or actor_id or "Operator"
    return actor_id, actor_display
