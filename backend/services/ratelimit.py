"""DB-backed login rate limiting + lockout (Phase 5).

Backed by ``rate_limit_buckets`` so limits hold across the multi-worker /
multi-instance deployment (an in-memory limiter would be per-process and
trivially bypassed). Best-effort under concurrent writes — adequate for slowing
brute force without a distributed lock.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from db_models import AuthEvent, RateLimitBucket


def _uid() -> str:
    import uuid
    return str(uuid.uuid4())


def check_allowed(db: Session, bucket_key: str) -> tuple[bool, Optional[int]]:
    """Return ``(allowed, retry_after_seconds)``. Denied while locked out."""
    bucket = db.get(RateLimitBucket, bucket_key)
    if bucket and bucket.locked_until:
        now = datetime.utcnow()
        if bucket.locked_until > now:
            return False, int((bucket.locked_until - now).total_seconds()) + 1
    return True, None


def record_failure(
    db: Session, bucket_key: str, *, limit: int, window_seconds: int, lockout_seconds: int,
) -> bool:
    """Count a failed attempt within the sliding window; lock out at the limit.
    Returns True if this failure triggered a lockout."""
    now = datetime.utcnow()
    bucket = db.get(RateLimitBucket, bucket_key)
    if bucket is None:
        bucket = RateLimitBucket(bucket_key=bucket_key, window_start=now, count=0, updated_at=now)
        db.add(bucket)
    # Reset the window if it has elapsed.
    if not bucket.window_start or (bucket.window_start + timedelta(seconds=window_seconds)) < now:
        bucket.window_start = now
        bucket.count = 0
        bucket.locked_until = None

    bucket.count = (bucket.count or 0) + 1
    bucket.updated_at = now
    locked = False
    if bucket.count >= limit:
        bucket.locked_until = now + timedelta(seconds=lockout_seconds)
        bucket.count = 0
        bucket.window_start = now
        locked = True
    db.commit()
    return locked


def record_success(db: Session, bucket_key: str) -> None:
    """Clear the bucket after a successful auth."""
    bucket = db.get(RateLimitBucket, bucket_key)
    if bucket:
        bucket.count = 0
        bucket.locked_until = None
        bucket.window_start = datetime.utcnow()
        bucket.updated_at = datetime.utcnow()
        db.commit()


def log_auth_event(
    db: Session, event_type: str, *, ip: Optional[str], user_agent: Optional[str], actor_hint: Optional[str],
) -> None:
    db.add(AuthEvent(
        id=_uid(), event_type=event_type, ip=ip,
        user_agent=(user_agent or "")[:400], actor_hint=actor_hint,
        created_at=datetime.utcnow(),
    ))
    db.commit()
