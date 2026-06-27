import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.types import JSON

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_run_at = Column(DateTime, nullable=True)
    # ── Ownership / tenancy (Phase 4.5) — nullable during single→multi migration ──
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class Run(Base):
    __tablename__ = "runs"
    # Hot path: the Requirements Workspace filters by project_id + status and
    # orders by created_at desc (see db_service._collect_project_requirements).
    __table_args__ = (
        Index("ix_runs_project_status_created", "project_id", "status", "created_at"),
    )

    id = Column(String(36), primary_key=True)  # same as job_id
    project_id = Column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String(20), nullable=False, default="running")
    provider = Column(String(50), nullable=True)
    model = Column(String(100), nullable=True)
    requirement_count = Column(Integer, default=0)
    test_case_count = Column(Integer, default=0)
    rag_enabled = Column(Boolean, default=False)
    prompt_version = Column(String(20), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)  # also holds the human-readable reason for warning/failed
    # Provider observability (Strict BYOK productionisation)
    failed_requirement_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    generation_duration = Column(Float, nullable=True)  # seconds
    fallback_used = Column(Boolean, default=False)
    # Coverage intelligence — stored for future dashboards, not yet surfaced in UI
    functional_count = Column(Integer, default=0)
    boundary_count = Column(Integer, default=0)
    negative_count = Column(Integer, default=0)
    fault_injection_count = Column(Integer, default=0)
    timing_count = Column(Integer, default=0)
    recovery_count = Column(Integer, default=0)
    safety_count = Column(Integer, default=0)
    # Snapshot of requirement coverage at generation time (covered / total)
    coverage_pct = Column(Float, nullable=True)
    # ── Run-level review governance (Phase 3) ─────────────────────────────────
    # review_state: draft | reviewed | approved | rejected (artifact governance,
    # distinct from the per-test-case review_status).
    review_state = Column(String(20), nullable=False, default="draft")
    locked = Column(Boolean, nullable=False, default=False)  # approved/rejected ⇒ locked
    # Denormalised latest sign-off (authoritative record lives in run_approval_events).
    # Future-proof identity: *_id is the stable subject (email today, OAuth sub later),
    # *_display is the human label.
    approved_by_id = Column(String(120), nullable=True)
    approved_by_display = Column(String(120), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    review_digest = Column(String(64), nullable=True)  # content hash bound at sign-off
    # ── Requirements lifecycle (Phase 4) ──────────────────────────────────────
    # If this run was generated from a baseline, which one.
    source_baseline_id = Column(String(36), ForeignKey("baselines.id", ondelete="SET NULL"), nullable=True)
    # Digest over the set of requirement *versions* the run used — binds an
    # approval to versions so a later requirement bump is detectable.
    requirement_versions_digest = Column(String(64), nullable=True)


class Requirement(Base):
    __tablename__ = "requirements"

    id = Column(String(36), primary_key=True, default=_uuid)
    run_id = Column(
        String(36),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    text = Column(Text, nullable=False)
    # Indexed: workspace dedup/linkage keys requirements by requirement_id.
    requirement_id = Column(String(50), nullable=True, index=True)
    position = Column(Integer, nullable=False)
    # Traceability + validation snapshot, persisted at finalize time so historical
    # runs can be reopened without re-deriving coverage/validation.
    covered = Column(Boolean, nullable=True)
    test_case_count = Column(Integer, default=0)
    coverage_warnings = Column(JSON, nullable=True)
    validation_status = Column(String(20), nullable=True)  # valid | warning | uncovered
    # ── Generation outcome (a separate axis from coverage) ────────────────────
    # generation_status: not_generated | pending | in_progress | generated | generation_failed
    # A requirement that *failed* generation must never read as merely "uncovered".
    generation_status = Column(String(20), nullable=True)
    # failure_type: rate_limit | timeout | malformed_response | validation_failure |
    #               parsing_failure | provider_unavailable | unknown (null unless failed)
    failure_type = Column(String(30), nullable=True)
    failure_reason = Column(Text, nullable=True)  # human-readable cause, attached to the requirement
    last_attempt_at = Column(DateTime, nullable=True)
    # Durable-job execution detail (Phase 2B): how many attempts this requirement
    # took, and when the worker started it. Distinct from the run-level counts.
    attempt_count = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    # Full deterministic parser output (ParsedRequirement.to_dict()): quality
    # analysis, thresholds, timing constraints, entities, category, ASIL, etc.
    # Populated from GenerateRequest.parsed so the Requirements Workspace can
    # surface this intelligence without re-parsing. None for legacy/raw-text runs.
    meta = Column(JSON, nullable=True)
    # The exact immutable requirement version this run row generated from
    # (Phase 4). Stays valid forever even as the catalog advances to vN+1.
    requirement_version_id = Column(
        String(36), ForeignKey("requirement_versions.id", ondelete="SET NULL"), nullable=True, index=True,
    )


class TestCaseDB(Base):
    __tablename__ = "test_cases"
    # Hot paths: review patch filters (run_id, test_id); workspace linkage groups
    # by requirement_id. UNIQUE so the worker's idempotent per-requirement
    # re-drive (delete-then-reinsert on resume) can never duplicate a test case —
    # deterministic id blocks guarantee (run_id, test_id) is unique by design.
    __table_args__ = (
        Index("ix_test_cases_run_id_test_id", "run_id", "test_id", unique=True),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    run_id = Column(
        String(36),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    test_id = Column(String(50), nullable=True)
    requirement_id = Column(String(50), nullable=True, index=True)
    title = Column(String(500), nullable=False)
    asil = Column(String(5), nullable=True)
    test_type = Column(String(50), nullable=True)
    preconditions = Column(JSON, nullable=True)
    steps = Column(JSON, nullable=True)
    expected_results = Column(JSON, nullable=True)
    source_requirement_text = Column(Text, nullable=True)
    generation_timestamp = Column(String(50), nullable=True)
    model_version = Column(String(100), nullable=True)
    prompt_version = Column(String(20), nullable=True)
    retry_count = Column(Integer, default=0)
    validation_status = Column(String(50), nullable=True)
    # Full round-trip of the TestCase model so historical views/exports are complete
    asil_source = Column(String(20), nullable=True)
    asil_confidence = Column(Integer, nullable=True)
    boundary_position = Column(String(10), nullable=True)
    coverage_warnings = Column(JSON, nullable=True)
    rag_sources = Column(JSON, nullable=True)
    rag_top_score = Column(Float, default=0.0)
    # Review workflow
    review_status = Column(String(20), nullable=True, default="pending")
    review_note = Column(Text, nullable=True)
    reviewed_at = Column(String(50), nullable=True)


class ReviewEvent(Base):
    """Immutable audit log of every review status/note change on a test case.

    One row per transition. ``test_case_id`` is the durable TestCaseDB.id
    (unique across runs), with ``run_id``/``test_id`` denormalised for fast
    run-scoped queries and human display. Never updated or deleted.
    """
    __tablename__ = "review_events"

    id = Column(String(36), primary_key=True, default=_uuid)
    run_id = Column(
        String(36),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    test_case_id = Column(
        String(36),
        ForeignKey("test_cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    test_id = Column(String(50), nullable=True)
    from_status = Column(String(20), nullable=True)
    to_status = Column(String(20), nullable=True)
    note = Column(Text, nullable=True)
    # ``actor`` is the legacy display string (kept for back-compat). Future-proof
    # identity (Phase 3): actor_id is the stable subject (email now, OAuth sub in
    # Phase 4.5), actor_display is the human label — so OAuth never rewrites history.
    actor = Column(String(100), nullable=True)
    actor_id = Column(String(120), nullable=True)
    actor_display = Column(String(120), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class RunApprovalEvent(Base):
    """Immutable ledger of run-level governance transitions (Phase 3).

    One append-only row per Draft→Reviewed→Approved/Rejected (and re-open)
    transition, carrying the real reviewer identity, a metrics snapshot, and the
    content digest the decision was bound to. Authoritative governance history;
    the matching fields on ``runs`` are a denormalised convenience.
    """
    __tablename__ = "run_approval_events"
    __table_args__ = (
        Index("ix_run_approval_events_run_created", "run_id", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    run_id = Column(
        String(36),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_state = Column(String(20), nullable=True)
    to_state = Column(String(20), nullable=True)
    # Future-proof identity (see ReviewEvent).
    actor_id = Column(String(120), nullable=True)
    actor_display = Column(String(120), nullable=True)
    note = Column(Text, nullable=True)
    # Metrics snapshot at decision time
    approved_count = Column(Integer, nullable=True)
    total_count = Column(Integer, nullable=True)
    coverage_pct = Column(Float, nullable=True)
    test_cases_digest = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ProviderKey(Base):
    __tablename__ = "provider_keys"
    # BYOK is org-scoped: one key per (organization, provider).
    __table_args__ = (
        Index("ix_provider_keys_org_provider", "organization_id", "provider", unique=True),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    provider = Column(String(50), nullable=False, index=True)
    api_key = Column(Text, nullable=True)
    endpoint = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)


class AppConfig(Base):
    """Key-value store for application-level settings (e.g. active_provider, active_model)."""
    __tablename__ = "app_config"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class RequirementCatalog(Base):
    """Canonical, project-scoped requirement (Phase 4).

    The stable identity for a requirement across runs. Mutable only in that
    ``current_version_id`` advances; the content history lives in the immutable
    ``requirement_versions`` chain.
    """
    __tablename__ = "requirements_catalog"
    __table_args__ = (
        Index("ix_requirements_catalog_project_key", "project_id", "requirement_key", unique=True),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    requirement_key = Column(String(80), nullable=False)  # e.g. REQ-AUTO-001
    title = Column(String(500), nullable=True)
    current_version_id = Column(String(36), nullable=True)  # FK set after first version
    archived = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class RequirementVersion(Base):
    """Immutable requirement version (Phase 4). Never updated or deleted."""
    __tablename__ = "requirement_versions"
    __table_args__ = (
        Index("ix_requirement_versions_req_no", "requirement_id", "version_no", unique=True),
        Index("ix_requirement_versions_req_hash", "requirement_id", "content_hash"),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    requirement_id = Column(
        String(36), ForeignKey("requirements_catalog.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    version_no = Column(Integer, nullable=False)
    statement = Column(Text, nullable=False)
    meta = Column(JSON, nullable=True)
    content_hash = Column(String(64), nullable=False)
    # change_class classifies the v(n-1)→v(n) transition: editorial | minor | major.
    # Default 'major' (fail-safe: an unclassified change is treated as functional).
    change_class = Column(String(12), nullable=False, default="major")
    change_reason = Column(Text, nullable=True)
    supersedes_version_id = Column(String(36), nullable=True)
    # Future-proof identity (Phase 3 pattern).
    author_id = Column(String(120), nullable=True)
    author_display = Column(String(120), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class RequirementChangeEvent(Base):
    """Immutable ledger of requirement lifecycle events + impact snapshot (Phase 4)."""
    __tablename__ = "requirement_change_events"
    __table_args__ = (
        Index("ix_requirement_change_events_req_created", "requirement_id", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    requirement_id = Column(
        String(36), ForeignKey("requirements_catalog.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    event_type = Column(String(20), nullable=False)  # created | revised | archived | restored
    from_version_id = Column(String(36), nullable=True)
    to_version_id = Column(String(36), nullable=True)
    change_class = Column(String(12), nullable=True)
    actor_id = Column(String(120), nullable=True)
    actor_display = Column(String(120), nullable=True)
    note = Column(Text, nullable=True)
    impact_snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Baseline(Base):
    """Immutable project snapshot header (Phase 4)."""
    __tablename__ = "baselines"
    __table_args__ = (
        Index("ix_baselines_project_name", "project_id", "name", unique=True),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(80), nullable=False)  # e.g. "1.0"
    note = Column(Text, nullable=True)
    created_by_id = Column(String(120), nullable=True)
    created_by_display = Column(String(120), nullable=True)
    content_digest = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class BaselineItem(Base):
    """Immutable, self-contained per-requirement snapshot inside a baseline (Phase 4).

    Carries a serialized ``test_cases_snapshot`` so the baseline stays viewable
    and exportable even if the source run is later deleted (``source_run_id`` is
    SET NULL on run delete, retained only for provenance).
    """
    __tablename__ = "baseline_items"

    id = Column(String(36), primary_key=True, default=_uuid)
    baseline_id = Column(String(36), ForeignKey("baselines.id", ondelete="CASCADE"), nullable=False, index=True)
    requirement_id = Column(String(36), ForeignKey("requirements_catalog.id", ondelete="SET NULL"), nullable=True)
    requirement_version_id = Column(String(36), ForeignKey("requirement_versions.id", ondelete="SET NULL"), nullable=True)
    requirement_key = Column(String(80), nullable=True)
    version_no = Column(Integer, nullable=True)
    statement = Column(Text, nullable=True)
    source_run_id = Column(String(36), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True)
    approval_state = Column(String(20), nullable=True)
    coverage_pct = Column(Float, nullable=True)
    test_case_count = Column(Integer, nullable=True)
    test_cases_snapshot = Column(JSON, nullable=True)
    items_digest = Column(String(64), nullable=True)


class User(Base):
    """A verified person (Phase 4.5). Created/linked on first OAuth login."""
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_primary_email", "primary_email", unique=True),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    primary_email = Column(String(255), nullable=False)
    display_name = Column(String(200), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="active")  # active | disabled
    # Email/password auth (Phase 4.6). NULL for OAuth-only users; set when a user
    # registers with a password. PBKDF2-HMAC-SHA256, format pbkdf2_sha256$iter$salt$hash.
    password_hash = Column(String(255), nullable=True)
    # Whether the primary_email has been confirmed. OAuth users keep the provider's
    # verification on UserIdentity; this is the User-level flag for email signups.
    email_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)


class UserIdentity(Base):
    """A linked OAuth identity (provider + subject) for a user (Phase 4.5)."""
    __tablename__ = "user_identities"
    __table_args__ = (
        Index("ix_user_identities_provider_subject", "provider", "provider_subject", unique=True),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(20), nullable=False)          # google | github | microsoft
    provider_subject = Column(String(255), nullable=False)  # OAuth 'sub' / id
    email_at_provider = Column(String(255), nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Organization(Base):
    """Tenancy boundary (Phase 4.5)."""
    __tablename__ = "organizations"
    __table_args__ = (
        Index("ix_organizations_slug", "slug", unique=True),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    slug = Column(String(80), nullable=False)
    created_by_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Membership(Base):
    """User ↔ Organization with a role (Phase 4.5)."""
    __tablename__ = "memberships"
    __table_args__ = (
        Index("ix_memberships_org_user", "org_id", "user_id", unique=True),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="member")  # owner|admin|reviewer|member|viewer
    status = Column(String(20), nullable=False, default="active")  # active|invited|disabled
    invited_by_user_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class OrgInvitation(Base):
    """Pending invite-by-email to an organization (Phase 4.5)."""
    __tablename__ = "org_invitations"
    __table_args__ = (
        Index("ix_org_invitations_org", "org_id"),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="member")
    token_hash = Column(String(64), nullable=False)
    invited_by_user_id = Column(String(36), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Session(Base):
    """Server-side, revocable session (Phase 4.5)."""
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_user", "user_id"),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    active_org_id = Column(String(36), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    user_agent = Column(String(400), nullable=True)
    ip = Column(String(64), nullable=True)


class RateLimitBucket(Base):
    """DB-backed sliding-window rate-limit bucket (Phase 5).

    DB-backed (not in-memory) so limits hold across the multi-worker / multi-
    instance deployment from Phase 2B.
    """
    __tablename__ = "rate_limit_buckets"

    bucket_key = Column(String(160), primary_key=True)  # e.g. "login:1.2.3.4"
    window_start = Column(DateTime, nullable=False, default=datetime.utcnow)
    count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class AuthEvent(Base):
    """Immutable audit log of authentication events (Phase 5)."""
    __tablename__ = "auth_events"
    __table_args__ = (
        Index("ix_auth_events_created", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=_uuid)
    event_type = Column(String(30), nullable=False)  # login_success | login_failure | lockout
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(400), nullable=True)
    actor_hint = Column(String(255), nullable=True)  # email if supplied
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class GenerationJob(Base):
    """Durable execution unit for a generation run (Phase 2B).

    1:1 with a ``Run`` (``id == run_id``). Kept separate from ``runs`` so the
    queue's hot, frequently-updated lease/heartbeat columns and its claim index
    never touch the write-once, read-heavy run artifact. ``status`` here is the
    *execution* status (where the work is in the pipeline), distinct from
    ``runs.status`` which is the *artifact* status.
    """
    __tablename__ = "generation_jobs"
    # Claim + reaper scan this; keep it its own narrow index.
    __table_args__ = (
        Index("ix_generation_jobs_status_lease", "status", "lease_expires_at"),
    )

    # job id == run id; deleting the run cascades the job away.
    id = Column(
        String(36),
        ForeignKey("runs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # queued | claimed | running | finalizing | complete | failed | cancelled
    status = Column(String(20), nullable=False, default="queued", index=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    # Lease / liveness
    claimed_by = Column(String(64), nullable=True)
    claimed_at = Column(DateTime, nullable=True)
    heartbeat_at = Column(DateTime, nullable=True)
    lease_expires_at = Column(DateTime, nullable=True)
    # Cooperative cancellation
    cancel_requested = Column(Boolean, nullable=False, default=False)
    # Denormalised progress for cheap SSE reads
    progress_current = Column(Integer, nullable=False, default=0)
    progress_total = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
