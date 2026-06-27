"""Identity, organization, membership & session operations (Phase 4.5).

The data layer for multi-user identity. Sessions are server-side and revocable;
the bearer token is a thin signed envelope carrying the session id + active org,
validated against the DB on every request so logout/disable take effect at once.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from auth import roles
from db_models import (
    Membership,
    Organization,
    Session as SessionModel,
    User,
    UserIdentity,
)

SESSION_TTL_HOURS = 24 * 7  # 1 week absolute


def _uid() -> str:
    return str(uuid.uuid4())


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (name or "org").lower()).strip("-") or "org"
    return base[:60]


# ─────────────────────────────────────────────
# Users & OAuth identities
# ─────────────────────────────────────────────

def get_user_by_email(db: DBSession, email: str) -> Optional[User]:
    return db.query(User).filter(func.lower(User.primary_email) == email.lower()).first()


def upsert_user_from_oauth(
    db: DBSession, *, provider: str, subject: str, email: str,
    name: Optional[str], avatar: Optional[str], email_verified: bool,
) -> User:
    """Resolve the user for an OAuth identity, creating/linking as needed.

    Linking rule (anti-takeover): an existing identity (provider, subject) always
    wins; otherwise we link to an existing user by email ONLY when the provider
    asserts the email is verified; else we create a new user.
    """
    ident = (
        db.query(UserIdentity)
        .filter(UserIdentity.provider == provider, UserIdentity.provider_subject == subject)
        .first()
    )
    if ident:
        user = db.get(User, ident.user_id)
        if user:
            user.last_login_at = datetime.utcnow()
            db.commit()
            return user

    # Only a provider-verified email may link to / become an authoritative
    # identity. An unverified email is untrusted (anti-takeover): the user gets a
    # distinct, provider-scoped primary_email, with the claimed address kept only
    # on the identity row.
    verified = bool(email and email_verified)
    user = get_user_by_email(db, email) if verified else None
    if user is None:
        primary = email if verified else f"{provider}:{subject}@unverified.local"
        user = User(id=_uid(), primary_email=primary, display_name=name or email,
                    avatar_url=avatar, status="active", created_at=datetime.utcnow(),
                    last_login_at=datetime.utcnow())
        db.add(user)
        db.flush()
    else:
        user.last_login_at = datetime.utcnow()

    db.add(UserIdentity(
        id=_uid(), user_id=user.id, provider=provider, provider_subject=subject,
        email_at_provider=email, email_verified=email_verified, created_at=datetime.utcnow(),
    ))
    db.commit()
    return user


def create_email_user(
    db: DBSession, *, email: str, password_hash: str, display_name: Optional[str]
) -> User:
    """Create a user that authenticates with email + password (Phase 4.6).

    The caller must have already verified the email is not in use. The new user is
    ``active`` but ``email_verified=False`` until they confirm via the verify flow.
    """
    user = User(
        id=_uid(), primary_email=email, display_name=display_name or email.split("@")[0],
        avatar_url=None, status="active", password_hash=password_hash,
        email_verified=False, created_at=datetime.utcnow(), last_login_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    return user


def set_password(db: DBSession, user: User, password_hash: str) -> None:
    """Set/replace a user's password hash (registration top-up or reset)."""
    user.password_hash = password_hash
    db.commit()


def mark_email_verified(db: DBSession, user: User) -> None:
    user.email_verified = True
    db.commit()


def password_fingerprint(user: User) -> str:
    """Short, stable fingerprint of the current credential state.

    Embedded in password-reset tokens so a token becomes single-use: once the
    password changes the fingerprint changes and any outstanding token is void.
    """
    import hashlib
    basis = f"{user.id}:{user.password_hash or ''}".encode("utf-8")
    return hashlib.sha256(basis).hexdigest()[:16]


# ─────────────────────────────────────────────
# Organizations & memberships
# ─────────────────────────────────────────────

def create_organization(db: DBSession, name: str, owner: User) -> Organization:
    org = Organization(id=_uid(), name=name, slug=f"{_slugify(name)}-{_uid()[:6]}",
                       created_by_user_id=owner.id, created_at=datetime.utcnow())
    db.add(org)
    db.flush()
    db.add(Membership(id=_uid(), org_id=org.id, user_id=owner.id, role=roles.OWNER,
                      status="active", created_at=datetime.utcnow()))
    db.commit()
    return org


def ensure_personal_org(db: DBSession, user: User) -> Organization:
    """Guarantee the user belongs to at least one org (personal org on first login)."""
    m = db.query(Membership).filter(Membership.user_id == user.id, Membership.status == "active").first()
    if m:
        return db.get(Organization, m.org_id)
    return create_organization(db, f"{user.display_name or user.primary_email}'s Org", user)


def memberships_for(db: DBSession, user_id: str) -> list[Membership]:
    return (
        db.query(Membership)
        .filter(Membership.user_id == user_id, Membership.status == "active")
        .all()
    )


def membership(db: DBSession, org_id: str, user_id: str) -> Optional[Membership]:
    return (
        db.query(Membership)
        .filter(Membership.org_id == org_id, Membership.user_id == user_id,
                Membership.status == "active")
        .first()
    )


def role_in_org(db: DBSession, org_id: str, user_id: str) -> Optional[str]:
    m = membership(db, org_id, user_id)
    return m.role if m else None


# ─────────────────────────────────────────────
# Sessions
# ─────────────────────────────────────────────

def create_session(db: DBSession, user: User, org: Optional[Organization],
                   *, ip: Optional[str] = None, user_agent: Optional[str] = None) -> SessionModel:
    s = SessionModel(
        id=_uid(), user_id=user.id, active_org_id=org.id if org else None,
        created_at=datetime.utcnow(), last_seen_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS),
        ip=ip, user_agent=(user_agent or "")[:400],
    )
    db.add(s)
    db.commit()
    return s


def resolve_session(db: DBSession, session_id: str) -> Optional[SessionModel]:
    s = db.get(SessionModel, session_id)
    if not s or s.revoked_at is not None:
        return None
    if s.expires_at and s.expires_at < datetime.utcnow():
        return None
    user = db.get(User, s.user_id)
    if not user or user.status != "active":
        return None
    return s


def touch_session(db: DBSession, session_id: str) -> None:
    s = db.get(SessionModel, session_id)
    if s:
        s.last_seen_at = datetime.utcnow()
        db.commit()


def revoke_session(db: DBSession, session_id: str) -> None:
    s = db.get(SessionModel, session_id)
    if s and s.revoked_at is None:
        s.revoked_at = datetime.utcnow()
        db.commit()


def switch_org(db: DBSession, session_id: str, org_id: str) -> bool:
    """Switch the session's active org — only to an org the user belongs to."""
    s = db.get(SessionModel, session_id)
    if not s:
        return False
    if not membership(db, org_id, s.user_id):
        return False
    s.active_org_id = org_id
    db.commit()
    return True


# ─────────────────────────────────────────────
# Serializers + backfill
# ─────────────────────────────────────────────

def user_to_dict(u: User) -> dict:
    return {"id": u.id, "email": u.primary_email, "display_name": u.display_name,
            "avatar_url": u.avatar_url, "status": u.status}


def org_to_dict(db: DBSession, org: Organization, role: Optional[str] = None) -> dict:
    return {"id": org.id, "name": org.name, "slug": org.slug, "role": role}


def backfill_default_org(db: DBSession) -> int:
    """Idempotently attach pre-multi-tenant data to a Default Organization.

    Creates a Default Org (owned by a synthetic legacy user), assigns every
    project with no organization to it, and moves global BYOK keys under it.
    Returns the number of projects assigned. No-op once projects are assigned.
    """
    from db_models import Project, ProviderKey

    unassigned = db.query(Project).filter(Project.organization_id.is_(None)).all()
    keys_unassigned = db.query(ProviderKey).filter(ProviderKey.organization_id.is_(None)).all()
    if not unassigned and not keys_unassigned:
        return 0

    org = db.query(Organization).filter(Organization.slug == "default-org").first()
    if not org:
        legacy = get_user_by_email(db, "legacy@local")
        if not legacy:
            legacy = User(id=_uid(), primary_email="legacy@local", display_name="Legacy",
                          status="active", created_at=datetime.utcnow())
            db.add(legacy)
            db.flush()
        org = Organization(id=_uid(), name="Default Organization", slug="default-org",
                           created_by_user_id=legacy.id, created_at=datetime.utcnow())
        db.add(org)
        db.flush()
        if not membership(db, org.id, legacy.id):
            db.add(Membership(id=_uid(), org_id=org.id, user_id=legacy.id, role=roles.OWNER,
                              status="active", created_at=datetime.utcnow()))

    for p in unassigned:
        p.organization_id = org.id
    for k in keys_unassigned:
        k.organization_id = org.id
    db.commit()
    return len(unassigned)
