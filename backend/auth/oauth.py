"""OAuth 2.0 / OIDC provider abstraction (Phase 4.5): Google, GitHub, Microsoft.

Authorization-Code + PKCE. The HTTP exchange lives in ``fetch_identity`` (one
seam, easily mocked in tests). Providers are enabled only when their client
id/secret are configured, so the platform degrades gracefully.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
from urllib.parse import urlencode

import httpx

import config

# provider → endpoints + scope
_PROVIDERS = {
    "google": {
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "userinfo": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email profile",
    },
    "github": {
        "authorize": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "userinfo": "https://api.github.com/user",
        "scope": "read:user user:email",
    },
    "microsoft": {
        "authorize": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo": "https://graph.microsoft.com/oidc/userinfo",
        "scope": "openid email profile",
    },
}


def enabled_providers() -> list[str]:
    return [p for p in _PROVIDERS if config.oauth_provider_config(p)]


def redirect_uri(provider: str) -> str:
    return f"{config.APP_BASE_URL}/auth/oauth/{provider}/callback"


def make_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE S256."""
    verifier = base64.urlsafe_b64encode(os.urandom(40)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).decode().rstrip("=")
    return verifier, challenge


def new_state() -> str:
    return secrets.token_urlsafe(24)


def authorize_url(provider: str, state: str, code_challenge: str) -> str | None:
    cfg = config.oauth_provider_config(provider)
    meta = _PROVIDERS.get(provider)
    if not cfg or not meta:
        return None
    params = {
        "client_id": cfg["client_id"],
        "redirect_uri": redirect_uri(provider),
        "response_type": "code",
        "scope": meta["scope"],
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "select_account",
    }
    return f"{meta['authorize']}?{urlencode(params)}"


def _exchange_code(provider: str, code: str, code_verifier: str) -> str:
    cfg = config.oauth_provider_config(provider)
    meta = _PROVIDERS[provider]
    data = {
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "code": code,
        "redirect_uri": redirect_uri(provider),
        "grant_type": "authorization_code",
        "code_verifier": code_verifier,
    }
    r = httpx.post(meta["token"], data=data, headers={"Accept": "application/json"}, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def fetch_identity(provider: str, code: str, code_verifier: str) -> dict:
    """Exchange the code and return a normalized identity dict:
    ``{sub, email, name, avatar, email_verified}``. Mocked in tests."""
    meta = _PROVIDERS[provider]
    access_token = _exchange_code(provider, code, code_verifier)
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
    info = httpx.get(meta["userinfo"], headers=headers, timeout=15).json()

    if provider == "github":
        email, verified = info.get("email"), False
        emails = httpx.get("https://api.github.com/user/emails", headers=headers, timeout=15).json()
        for e in emails if isinstance(emails, list) else []:
            if e.get("primary"):
                email, verified = e.get("email"), bool(e.get("verified"))
                break
        return {"sub": str(info.get("id")), "email": email, "name": info.get("name") or info.get("login"),
                "avatar": info.get("avatar_url"), "email_verified": verified}

    # google / microsoft (OIDC userinfo)
    return {
        "sub": str(info.get("sub")),
        "email": info.get("email"),
        "name": info.get("name"),
        "avatar": info.get("picture"),
        "email_verified": bool(info.get("email_verified", False)),
    }
