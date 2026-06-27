"""Role-based access control matrix (Phase 4.5).

Roles are a fixed enum with a code-defined permission set (no role table — keeps
authorization auditable in one place). Membership.role maps to these.
"""

from __future__ import annotations

# Roles, most→least privileged.
OWNER = "owner"
ADMIN = "admin"
REVIEWER = "reviewer"
MEMBER = "member"
VIEWER = "viewer"
ALL_ROLES = (OWNER, ADMIN, REVIEWER, MEMBER, VIEWER)

# Permissions.
P_MANAGE_ORG = "manage_org"          # members, roles, invites, settings
P_MANAGE_KEYS = "manage_keys"        # BYOK provider keys
P_WRITE_PROJECT = "write_project"    # create/edit projects, requirements, generate
P_REVIEW = "review"                  # review, approve/reject, sign off, cut baselines
P_READ = "read"                      # read projects/runs/baselines

_MATRIX: dict[str, set[str]] = {
    OWNER:    {P_MANAGE_ORG, P_MANAGE_KEYS, P_WRITE_PROJECT, P_REVIEW, P_READ},
    ADMIN:    {P_MANAGE_ORG, P_MANAGE_KEYS, P_WRITE_PROJECT, P_REVIEW, P_READ},
    REVIEWER: {P_WRITE_PROJECT, P_REVIEW, P_READ},
    MEMBER:   {P_WRITE_PROJECT, P_READ},
    VIEWER:   {P_READ},
}


def has_permission(role: str | None, permission: str) -> bool:
    return permission in _MATRIX.get((role or "").lower(), set())


def role_rank(role: str | None) -> int:
    try:
        return len(ALL_ROLES) - ALL_ROLES.index((role or "").lower())
    except ValueError:
        return 0
