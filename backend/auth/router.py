"""Auth endpoints: legacy gate (/auth/login, /auth/me), email/password identity
(/auth/register, /auth/login/email, password reset, email verification) and the
OAuth + multi-user session flow."""

from __future__ import annotations

import logging
import random
import re
import time
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import config
from database import SessionLocal
from services import identity, ratelimit

from .security import (
    TOKEN_TTL_HOURS,
    hash_password,
    issue_session_token,
    issue_token,
    seal,
    unseal,
    verify_password,
    verify_user_password,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _valid_email(email: str | None) -> bool:
    return bool(email and _EMAIL_RE.match(email))


def _password_problem(pw: str | None) -> str | None:
    """Return a human message if the password is too weak, else None."""
    if not pw or len(pw) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[A-Za-z]", pw):
        return "Password must contain at least one letter."
    if not re.search(r"\d", pw):
        return "Password must contain at least one number."
    return None


def _user_dict(user) -> dict:
    return {
        "id": user.id, "email": user.primary_email,
        "display_name": user.display_name, "email_verified": user.email_verified,
    }


def _open_user_session(db, user, request: Request) -> tuple[str, object]:
    """Ensure the user has a personal org, open a server-side session, return
    (session_token, org). Shared by register / email-login / password-reset."""
    org = identity.ensure_personal_org(db, user)
    sess = identity.create_session(
        db, user, org,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return issue_session_token(sess.id, user.id, org.id), org


def _make_verify_url(user) -> str:
    token = seal({"typ": "verify", "uid": user.id}, ttl_seconds=24 * 3600)
    return f"{config.FRONTEND_URL}/verify-email?token={token}"


class LoginRequest(BaseModel):
    password: str
    email: str | None = None  # reviewer identity (not used for auth, but recorded)
    name: str | None = None   # optional display name


def _client_ip(request: Request) -> str:
    # X-Forwarded-For (first hop) when behind a proxy, else the socket peer.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login")
def login(body: LoginRequest, request: Request):
    """Exchange the shared app password for a time-limited bearer token.

    Brute-force protected: failed attempts are counted per client IP in a
    DB-backed sliding window and locked out at the configured threshold. Failures
    add a small random delay. Every attempt is recorded in the auth-event log.
    """
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")
    bucket = f"login:{ip}"
    db = SessionLocal()
    try:
        allowed, retry_after = ratelimit.check_allowed(db, bucket)
        if not allowed:
            ratelimit.log_auth_event(db, "lockout", ip=ip, user_agent=ua, actor_hint=body.email)
            return JSONResponse(
                {"detail": "Too many attempts. Try again later."},
                status_code=429,
                headers={"Retry-After": str(retry_after or config.LOGIN_LOCKOUT_SECONDS)},
            )

        if not verify_password(body.password):
            time.sleep(random.uniform(0.2, 0.6))  # slow brute force
            locked = ratelimit.record_failure(
                db, bucket, limit=config.LOGIN_MAX_ATTEMPTS,
                window_seconds=config.LOGIN_WINDOW_SECONDS,
                lockout_seconds=config.LOGIN_LOCKOUT_SECONDS,
            )
            ratelimit.log_auth_event(
                db, "lockout" if locked else "login_failure",
                ip=ip, user_agent=ua, actor_hint=body.email,
            )
            return JSONResponse({"detail": "Invalid credentials"}, status_code=401)

        ratelimit.record_success(db, bucket)
        ratelimit.log_auth_event(db, "login_success", ip=ip, user_agent=ua, actor_hint=body.email)
    finally:
        db.close()

    actor_id = (body.email or "").strip() or None
    actor_display = (body.name or "").strip() or actor_id or "Operator"
    token = issue_token(actor_id=actor_id, actor_display=actor_display)
    return {
        "token": token,
        "token_type": "bearer",
        "expires_in": TOKEN_TTL_HOURS * 3600,
        "actor_id": actor_id,
        "actor_display": actor_display,
    }


@router.get("/me")
def me():
    """Lightweight session check. Reaching here means the gate already passed."""
    return {"authenticated": True}


# ─────────────────────────────────────────────
# Email / password identity (Phase 4.6)
# ─────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class EmailLoginRequest(BaseModel):
    email: str
    password: str


class EmailRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


@router.post("/register")
def register(body: RegisterRequest, request: Request):
    """Create an email/password account, then sign the user in immediately.

    Creates the user (PBKDF2-hashed password), a personal organization with the
    Owner role, and a server-side session. Coexists with OAuth users — the email
    must be unused by any account.
    """
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")
    bucket = f"register:{ip}"
    db = SessionLocal()
    try:
        allowed, retry_after = ratelimit.check_allowed(db, bucket)
        if not allowed:
            return JSONResponse(
                {"detail": "Too many attempts. Try again later."}, status_code=429,
                headers={"Retry-After": str(retry_after or config.LOGIN_LOCKOUT_SECONDS)},
            )

        email = (body.email or "").strip().lower()
        if not _valid_email(email):
            return JSONResponse({"detail": "Enter a valid email address."}, status_code=422)
        problem = _password_problem(body.password)
        if problem:
            return JSONResponse({"detail": problem}, status_code=422)
        if identity.get_user_by_email(db, email):
            return JSONResponse(
                {"detail": "An account with this email already exists."}, status_code=409,
            )

        user = identity.create_email_user(
            db, email=email, password_hash=hash_password(body.password),
            display_name=(body.name or "").strip() or None,
        )
        ratelimit.record_success(db, bucket)
        ratelimit.log_auth_event(db, "register", ip=ip, user_agent=ua, actor_hint=email)
        token, org = _open_user_session(db, user, request)

        verify_url = _make_verify_url(user)
        logger.info("Email verification link for %s: %s", email, verify_url)
        resp: dict = {
            "token": token, "token_type": "bearer",
            "expires_in": TOKEN_TTL_HOURS * 3600,
            "user": _user_dict(user), "active_org_id": org.id,
        }
        if not config.is_production():
            resp["verify_url"] = verify_url
        return resp
    finally:
        db.close()


@router.post("/login/email")
def login_email(body: EmailLoginRequest, request: Request):
    """Authenticate a user by email + password and open a session.

    Falls back to the legacy shared APP_PASSWORD (when enabled) so the existing
    operator login keeps working through the same form.
    """
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")
    bucket = f"login:{ip}"
    db = SessionLocal()
    try:
        allowed, retry_after = ratelimit.check_allowed(db, bucket)
        if not allowed:
            ratelimit.log_auth_event(db, "lockout", ip=ip, user_agent=ua, actor_hint=body.email)
            return JSONResponse(
                {"detail": "Too many attempts. Try again later."}, status_code=429,
                headers={"Retry-After": str(retry_after or config.LOGIN_LOCKOUT_SECONDS)},
            )

        email = (body.email or "").strip().lower()
        user = identity.get_user_by_email(db, email)
        if user and user.status == "active" and verify_user_password(body.password, user.password_hash):
            user.last_login_at = datetime.utcnow()
            db.commit()
            ratelimit.record_success(db, bucket)
            ratelimit.log_auth_event(db, "login_success", ip=ip, user_agent=ua, actor_hint=email)
            token, org = _open_user_session(db, user, request)
            return {
                "token": token, "token_type": "bearer",
                "expires_in": TOKEN_TTL_HOURS * 3600,
                "user": _user_dict(user), "active_org_id": org.id,
            }

        # Legacy shared-password fallback (operator login during the transition).
        if config.LEGACY_PASSWORD_AUTH and verify_password(body.password):
            ratelimit.record_success(db, bucket)
            ratelimit.log_auth_event(db, "login_success", ip=ip, user_agent=ua, actor_hint=email)
            actor_id = email or None
            tok = issue_token(actor_id=actor_id, actor_display=email or "Operator")
            return {
                "token": tok, "token_type": "bearer",
                "expires_in": TOKEN_TTL_HOURS * 3600,
                "user": {"id": None, "email": email, "display_name": email or "Operator",
                         "email_verified": True},
                "active_org_id": None, "legacy": True,
            }

        time.sleep(random.uniform(0.2, 0.6))  # slow brute force
        locked = ratelimit.record_failure(
            db, bucket, limit=config.LOGIN_MAX_ATTEMPTS,
            window_seconds=config.LOGIN_WINDOW_SECONDS,
            lockout_seconds=config.LOGIN_LOCKOUT_SECONDS,
        )
        ratelimit.log_auth_event(
            db, "lockout" if locked else "login_failure",
            ip=ip, user_agent=ua, actor_hint=email,
        )
        return JSONResponse({"detail": "Invalid email or password."}, status_code=401)
    finally:
        db.close()


@router.post("/password/forgot")
def password_forgot(body: EmailRequest, request: Request):
    """Begin a password reset. Always returns ``{ok: true}`` (no account
    enumeration). In development the reset link/token is returned for testing;
    in production it would be emailed."""
    ip = _client_ip(request)
    ua = request.headers.get("user-agent")
    bucket = f"forgot:{ip}"
    db = SessionLocal()
    try:
        resp: dict = {"ok": True}
        allowed, _ = ratelimit.check_allowed(db, bucket)
        if not allowed:
            return resp  # silently throttle — never reveal state

        email = (body.email or "").strip().lower()
        user = identity.get_user_by_email(db, email) if _valid_email(email) else None
        if user and user.status == "active":
            token = seal(
                {"typ": "pwreset", "uid": user.id, "fp": identity.password_fingerprint(user)},
                ttl_seconds=3600,
            )
            url = f"{config.FRONTEND_URL}/reset-password?token={token}"
            logger.info("Password reset link for %s: %s", email, url)
            ratelimit.log_auth_event(db, "password_reset_request", ip=ip, user_agent=ua, actor_hint=email)
            if not config.is_production():
                resp["reset_url"] = url
                resp["reset_token"] = token
        # Throttle abuse regardless of whether the account exists.
        ratelimit.record_failure(
            db, bucket, limit=config.LOGIN_MAX_ATTEMPTS,
            window_seconds=config.LOGIN_WINDOW_SECONDS,
            lockout_seconds=config.LOGIN_LOCKOUT_SECONDS,
        )
        return resp
    finally:
        db.close()


@router.post("/password/reset")
def password_reset(body: ResetPasswordRequest, request: Request):
    """Complete a password reset with a sealed token, then sign the user in.

    The token embeds a fingerprint of the current credential state, so it is
    single-use: once the password changes, the token no longer validates."""
    db = SessionLocal()
    try:
        data = unseal(body.token)
        if not data or data.get("typ") != "pwreset":
            return JSONResponse({"detail": "Invalid or expired reset link."}, status_code=400)
        problem = _password_problem(body.password)
        if problem:
            return JSONResponse({"detail": problem}, status_code=422)

        from db_models import User
        user = db.get(User, data.get("uid", ""))
        if not user or user.status != "active":
            return JSONResponse({"detail": "Invalid or expired reset link."}, status_code=400)
        if data.get("fp") != identity.password_fingerprint(user):
            return JSONResponse({"detail": "This reset link has already been used."}, status_code=400)

        identity.set_password(db, user, hash_password(body.password))
        ratelimit.log_auth_event(
            db, "password_reset", ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"), actor_hint=user.primary_email,
        )
        token, org = _open_user_session(db, user, request)
        return {
            "ok": True, "token": token, "token_type": "bearer",
            "expires_in": TOKEN_TTL_HOURS * 3600,
            "user": _user_dict(user), "active_org_id": org.id,
        }
    finally:
        db.close()


@router.post("/verify-email")
def verify_email(body: VerifyEmailRequest):
    """Confirm an email address from a sealed verification token."""
    db = SessionLocal()
    try:
        data = unseal(body.token)
        if not data or data.get("typ") != "verify":
            return JSONResponse({"detail": "Invalid or expired verification link."}, status_code=400)
        from db_models import User
        user = db.get(User, data.get("uid", ""))
        if not user:
            return JSONResponse({"detail": "Invalid or expired verification link."}, status_code=400)
        identity.mark_email_verified(db, user)
        return {"ok": True, "email": user.primary_email}
    finally:
        db.close()


@router.post("/verify-email/request")
def verify_email_request(body: EmailRequest):
    """(Re)send an email verification link. Anti-enumeration: always ``ok``."""
    db = SessionLocal()
    try:
        resp: dict = {"ok": True}
        email = (body.email or "").strip().lower()
        user = identity.get_user_by_email(db, email) if _valid_email(email) else None
        if user and not user.email_verified:
            url = _make_verify_url(user)
            logger.info("Verification link for %s: %s", email, url)
            if not config.is_production():
                resp["verify_url"] = url
        return resp
    finally:
        db.close()


# ─────────────────────────────────────────────
# OAuth / multi-user sessions (Phase 4.5)
# ─────────────────────────────────────────────

@router.get("/providers")
def providers():
    """Which sign-in methods are available."""
    from . import oauth
    return {"oauth": oauth.enabled_providers(), "legacy_password": config.LEGACY_PASSWORD_AUTH}


@router.get("/oauth/{provider}/start")
def oauth_start(provider: str):
    """Begin an OAuth login: redirect to the provider with PKCE + signed state."""
    from fastapi.responses import RedirectResponse
    from . import oauth, security

    if provider not in oauth.enabled_providers():
        return JSONResponse({"detail": f"Provider '{provider}' is not enabled."}, status_code=404)
    state = oauth.new_state()
    verifier, challenge = oauth.make_pkce()
    url = oauth.authorize_url(provider, state, challenge)
    tx = security.seal({"provider": provider, "state": state, "verifier": verifier}, ttl_seconds=600)
    resp = RedirectResponse(url, status_code=302)
    # httpOnly, short-lived transaction cookie — not the session credential.
    resp.set_cookie("oauth_tx", tx, max_age=600, httponly=True, samesite="lax",
                    secure=config.is_production())
    return resp


@router.get("/oauth/{provider}/callback")
def oauth_callback(provider: str, request: Request, code: str = "", state: str = ""):
    """Complete OAuth: validate state, exchange code, upsert user, open a session."""
    from fastapi.responses import RedirectResponse
    from . import oauth, security
    from database import SessionLocal
    from services import identity

    tx = security.unseal(request.cookies.get("oauth_tx"))
    if not tx or tx.get("provider") != provider or not state or tx.get("state") != state:
        return JSONResponse({"detail": "Invalid or expired OAuth state."}, status_code=400)
    if not code:
        return JSONResponse({"detail": "Missing authorization code."}, status_code=400)

    try:
        ident = oauth.fetch_identity(provider, code, tx["verifier"])
    except Exception:
        return JSONResponse({"detail": "OAuth exchange failed."}, status_code=400)
    if not ident.get("sub") or not ident.get("email"):
        return JSONResponse({"detail": "Provider did not return an email."}, status_code=400)

    db = SessionLocal()
    try:
        user = identity.upsert_user_from_oauth(
            db, provider=provider, subject=ident["sub"], email=ident["email"],
            name=ident.get("name"), avatar=ident.get("avatar"),
            email_verified=bool(ident.get("email_verified")),
        )
        org = identity.ensure_personal_org(db, user)
        sess = identity.create_session(
            db, user, org, ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        token = security.issue_session_token(sess.id, user.id, org.id)
    finally:
        db.close()

    resp = RedirectResponse(f"{config.FRONTEND_URL}/auth/callback#token={token}", status_code=302)
    resp.delete_cookie("oauth_tx")
    return resp


@router.get("/session")
def session_info(request: Request):
    """Current principal + the orgs the user can act in."""
    from database import SessionLocal
    from auth.principal import principal_from_token, request_token
    from services import identity

    db = SessionLocal()
    try:
        p = principal_from_token(db, request_token(request))
        if p is None:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        orgs = []
        if p.user_id:
            from db_models import Organization
            for m in identity.memberships_for(db, p.user_id):
                org = db.get(Organization, m.org_id)
                if org:
                    orgs.append({"id": org.id, "name": org.name, "slug": org.slug, "role": m.role})
        return {
            "authenticated": True,
            "user": {"id": p.user_id, "email": p.actor_id, "display_name": p.actor_display},
            "active_org_id": p.active_org_id,
            "role": p.role,
            "is_legacy": p.is_legacy,
            "orgs": orgs,
        }
    finally:
        db.close()


@router.post("/logout")
def logout(request: Request):
    """Revoke the current server-side session."""
    from database import SessionLocal
    from auth.security import decode_token
    from auth.principal import request_token
    from services import identity

    data = decode_token(request_token(request))
    if data and data.get("typ") == "session":
        db = SessionLocal()
        try:
            identity.revoke_session(db, data.get("sid", ""))
        finally:
            db.close()
    return {"ok": True}


@router.post("/switch-org")
def switch_org(body: dict, request: Request):
    """Switch the active org for the current session (must be a member)."""
    from database import SessionLocal
    from auth.security import decode_token, issue_session_token
    from auth.principal import request_token
    from services import identity

    data = decode_token(request_token(request))
    if not data or data.get("typ") != "session":
        return JSONResponse({"detail": "Session required."}, status_code=400)
    org_id = (body or {}).get("org_id")
    db = SessionLocal()
    try:
        if not org_id or not identity.switch_org(db, data["sid"], org_id):
            return JSONResponse({"detail": "Not a member of that organization."}, status_code=403)
        token = issue_session_token(data["sid"], data["uid"], org_id)
        return {"ok": True, "token": token, "active_org_id": org_id}
    finally:
        db.close()
