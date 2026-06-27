"""Request principal + authorization (Phase 4.5).

Resolves the caller from the bearer token into a ``Principal`` (real OAuth user,
or a legacy shared-password operator during the transition) and provides the
org-scoped authorization checks endpoints use to enforce tenancy isolation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session as DBSession

import config
from auth import roles
from auth.security import decode_token


@dataclass
class Principal:
    actor_id: Optional[str]
    actor_display: str
    user_id: Optional[str]
    active_org_id: Optional[str]
    role: Optional[str]
    is_legacy: bool

    def can(self, permission: str) -> bool:
        # Legacy shared-password operator retains full single-tenant access.
        return True if self.is_legacy else roles.has_permission(self.role, permission)


def request_token(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.query_params.get("token")


def _legacy_default_org_id(db: DBSession) -> Optional[str]:
    from db_models import Organization
    org = db.query(Organization).filter(Organization.slug == "default-org").first()
    return org.id if org else None


def principal_from_token(db: DBSession, token: Optional[str]) -> Optional[Principal]:
    data = decode_token(token)
    if data is None:
        return None

    if data.get("typ") == "session":
        from services import identity
        from db_models import User
        s = identity.resolve_session(db, data.get("sid", ""))
        if s is None:
            return None
        user = db.get(User, s.user_id)
        role = identity.role_in_org(db, s.active_org_id, s.user_id) if s.active_org_id else None
        return Principal(
            actor_id=user.primary_email if user else None,
            actor_display=(user.display_name or user.primary_email) if user else "User",
            user_id=s.user_id, active_org_id=s.active_org_id, role=role, is_legacy=False,
        )

    # Legacy shared-password token (allowed only during the transition).
    if not config.LEGACY_PASSWORD_AUTH:
        return None
    return Principal(
        actor_id=data.get("aid"), actor_display=data.get("adisp") or "Operator",
        user_id=None, active_org_id=_legacy_default_org_id(db), role=roles.OWNER, is_legacy=True,
    )


def require_principal(db: DBSession, request: Request) -> Principal:
    p = principal_from_token(db, request_token(request))
    if p is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return p


def authorize_org(principal: Principal, org_id: Optional[str], permission: str) -> None:
    """Authorize a permission within an org. Legacy operators bypass tenancy."""
    if principal.is_legacy:
        return
    if not org_id or principal.active_org_id != org_id:
        raise HTTPException(status_code=404, detail="Not found")  # don't leak existence
    if not principal.can(permission):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def authorize_project(db: DBSession, principal: Principal, project_id: str, permission: str) -> None:
    """Authorize access to a project's org. 404 (not 403) on cross-tenant access
    so resource existence isn't leaked."""
    from db_models import Project
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    authorize_org(principal, project.organization_id, permission)


def authorize_run(db: DBSession, principal: Principal, run_id: str, permission: str) -> None:
    """Authorize a run by resolving run → project → org."""
    from db_models import Run
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Not found")
    authorize_project(db, principal, run.project_id, permission)


def authorize_baseline(db: DBSession, principal: Principal, baseline_id: str, permission: str) -> None:
    """Authorize a baseline by resolving baseline → project → org."""
    from db_models import Baseline
    bl = db.get(Baseline, baseline_id)
    if not bl:
        raise HTTPException(status_code=404, detail="Not found")
    authorize_project(db, principal, bl.project_id, permission)


def visible_to(principal: Principal, org_id: Optional[str]) -> bool:
    """Whether the principal may see an object owned by ``org_id`` (for list filtering)."""
    return principal.is_legacy or (org_id is not None and org_id == principal.active_org_id)


def current_principal(request: Request) -> Principal:
    """FastAPI dependency: resolve the request principal (401 if unauthenticated)."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        return require_principal(db, request)
    finally:
        db.close()
