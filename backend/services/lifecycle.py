"""Requirements lifecycle engine (Phase 4).

Canonical requirement catalog + immutable version chain, change classification
(editorial / minor / major), impact analysis, approval invalidation
(superseded detection), and baselines. Built on the Phase 1-3 patterns: immutable
ledgers, content digests, future-proof ``actor_id``/``actor_display`` identity.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from db_models import (
    Baseline,
    BaselineItem,
    Requirement,
    RequirementCatalog,
    RequirementChangeEvent,
    RequirementVersion,
    Run,
    TestCaseDB,
)

# Semantic meta fields that constitute a *functional* requirement change.
_SEMANTIC_KEYS = ("asil", "category", "thresholds", "timing_constraints",
                  "entities", "units", "logical_operators")

# Change-class severity ordering.
_SEVERITY = {"editorial": 0, "minor": 1, "major": 2}
_REQ_UNKNOWN = "REQ_UNKNOWN"


def _uid() -> str:
    return str(uuid.uuid4())


def _normalize(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _semantic(meta: dict | None) -> dict:
    return {k: (meta or {}).get(k) for k in _SEMANTIC_KEYS}


def content_hash(statement: str, meta: dict | None) -> str:
    """SHA-256 over raw statement + semantic meta. Any textual change yields a new
    hash (so a version is created); editorial-only changes are then *classified*,
    not suppressed."""
    blob = json.dumps({"s": statement or "", "m": _semantic(meta)}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def suggest_change_class(current: Optional[RequirementVersion], statement: str, meta: dict | None) -> str:
    """Heuristic default classification for a v(n-1)→v(n) transition."""
    if current is None:
        return "major"
    same_text = _normalize(current.statement) == _normalize(statement)
    same_sem = _semantic(current.meta) == _semantic(meta)
    if same_text and same_sem:
        return "editorial"   # whitespace/case/punctuation only
    if not same_sem:
        return "major"       # functional content changed
    return "minor"           # wording changed, semantics intact


# ─────────────────────────────────────────────
# Catalog + versions
# ─────────────────────────────────────────────

def get_catalog(db: Session, project_id: str, requirement_key: str) -> Optional[RequirementCatalog]:
    return (
        db.query(RequirementCatalog)
        .filter(RequirementCatalog.project_id == project_id,
                RequirementCatalog.requirement_key == requirement_key.upper())
        .first()
    )


def get_or_create_catalog(db: Session, project_id: str, requirement_key: str, title: str | None = None) -> RequirementCatalog:
    cat = get_catalog(db, project_id, requirement_key)
    if cat:
        return cat
    cat = RequirementCatalog(
        id=_uid(), project_id=project_id, requirement_key=requirement_key.upper(),
        title=title, created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db.add(cat)
    db.flush()
    return cat


def current_version(db: Session, catalog: RequirementCatalog) -> Optional[RequirementVersion]:
    if not catalog.current_version_id:
        return None
    return db.get(RequirementVersion, catalog.current_version_id)


def create_version(
    db: Session,
    catalog: RequirementCatalog,
    statement: str,
    meta: dict | None,
    *,
    author_id: Optional[str],
    author_display: Optional[str],
    change_reason: Optional[str] = None,
    change_class: Optional[str] = None,
    event_type: str = "revised",
    commit: bool = True,
) -> tuple[RequirementVersion, Optional[dict]]:
    """Create a new immutable version unless content is unchanged (dedup by hash).

    Returns ``(version, impact)``; ``impact`` is None when no superseding occurred
    (first version, or no-op). Logs an immutable change event.
    """
    h = content_hash(statement, meta)
    current = current_version(db, catalog)
    if current and current.content_hash == h:
        return current, None  # no content change → no new version

    version_no = (current.version_no + 1) if current else 1
    if change_class is None:
        change_class = suggest_change_class(current, statement, meta)
    if change_class not in _SEVERITY:
        change_class = "major"

    version = RequirementVersion(
        id=_uid(), requirement_id=catalog.id, version_no=version_no,
        statement=statement, meta=meta, content_hash=h, change_class=change_class,
        change_reason=change_reason, supersedes_version_id=current.id if current else None,
        author_id=author_id, author_display=author_display, created_at=datetime.utcnow(),
    )
    db.add(version)
    db.flush()
    catalog.current_version_id = version.id
    catalog.updated_at = datetime.utcnow()

    impact = compute_impact(db, catalog, current) if current else None
    db.add(RequirementChangeEvent(
        id=_uid(), requirement_id=catalog.id,
        event_type=("created" if current is None else event_type),
        from_version_id=current.id if current else None, to_version_id=version.id,
        change_class=change_class, actor_id=author_id, actor_display=author_display,
        note=change_reason, impact_snapshot=impact, created_at=datetime.utcnow(),
    ))
    if commit:
        db.commit()
    return version, impact


def link_run_requirement(
    db: Session, project_id: str, requirement_key: str, statement: str, meta: dict | None,
    *, author_id: Optional[str], author_display: Optional[str],
) -> Optional[str]:
    """Resolve (create) the catalog requirement + version for a generation run row,
    returning the version id to stamp onto the Requirement. ``REQ_UNKNOWN`` rows
    are not catalogued (no stable identity)."""
    if not requirement_key or requirement_key.upper() == _REQ_UNKNOWN:
        return None
    catalog = get_or_create_catalog(db, project_id, requirement_key, title=statement[:200])
    version, _ = create_version(
        db, catalog, statement, meta,
        author_id=author_id, author_display=author_display or "Generator",
        change_reason="captured from generation run", event_type="revised", commit=False,
    )
    return version.id


def revise_requirement(
    db: Session, project_id: str, requirement_key: str, statement: str, meta: dict | None,
    *, change_reason: str, change_class: Optional[str], actor_id: Optional[str], actor_display: str,
) -> dict:
    """User-facing edit: create a new version (with classification) and return it
    plus the computed impact."""
    catalog = get_catalog(db, project_id, requirement_key)
    if not catalog:
        return {"error": f"Requirement '{requirement_key}' not found in catalog."}
    version, impact = create_version(
        db, catalog, statement, meta, author_id=actor_id, author_display=actor_display,
        change_reason=change_reason, change_class=change_class, event_type="revised",
    )
    return {"version": version_to_dict(version), "impact": impact, "catalog": catalog_to_dict(db, catalog)}


# ─────────────────────────────────────────────
# Impact analysis + approval invalidation
# ─────────────────────────────────────────────

def compute_impact(db: Session, catalog: RequirementCatalog, from_version: Optional[RequirementVersion]) -> dict:
    """What a supersede of ``from_version`` affects: runs, approvals, test cases,
    baselines. Computed from persisted linkage."""
    if from_version is None:
        return {"affected_runs": [], "affected_run_count": 0, "approved_run_count": 0,
                "affected_test_cases": 0, "affected_baselines": 0}

    rows = (
        db.query(Requirement)
        .filter(Requirement.requirement_version_id == from_version.id)
        .all()
    )
    run_ids = sorted({r.run_id for r in rows})
    approved = 0
    affected_tcs = 0
    key = catalog.requirement_key.upper()
    for run_id in run_ids:
        run = db.get(Run, run_id)
        if run and run.review_state == "approved":
            approved += 1
        affected_tcs += (
            db.query(TestCaseDB)
            .filter(TestCaseDB.run_id == run_id,
                    TestCaseDB.requirement_id == key)
            .count()
        )
    baselines = (
        db.query(BaselineItem)
        .filter(BaselineItem.requirement_version_id == from_version.id)
        .count()
    )
    return {
        "requirement_key": key,
        "from_version_no": from_version.version_no,
        "affected_runs": run_ids,
        "affected_run_count": len(run_ids),
        "approved_run_count": approved,
        "affected_test_cases": affected_tcs,
        "affected_baselines": baselines,
    }


def run_supersede_info(db: Session, run_id: str) -> dict:
    """Per-run requirement-version drift, for approval invalidation.

    A run is *superseded* when a requirement it generated from has advanced and the
    cumulative change since is ``minor`` or ``major``. Editorial-only drift keeps
    the run valid.
    """
    rows = (
        db.query(Requirement)
        .filter(Requirement.run_id == run_id,
                Requirement.requirement_version_id.isnot(None))
        .all()
    )
    drift = []
    worst = -1
    for r in rows:
        v = db.get(RequirementVersion, r.requirement_version_id)
        if not v:
            continue
        cat = db.get(RequirementCatalog, v.requirement_id)
        if not cat or not cat.current_version_id or cat.current_version_id == v.id:
            continue
        # Cumulative severity of versions strictly after the one the run used.
        newer = (
            db.query(RequirementVersion)
            .filter(RequirementVersion.requirement_id == cat.id,
                    RequirementVersion.version_no > v.version_no)
            .all()
        )
        if not newer:
            continue
        sev = max(_SEVERITY.get(nv.change_class, 2) for nv in newer)
        worst = max(worst, sev)
        current = db.get(RequirementVersion, cat.current_version_id)
        drift.append({
            "requirement_key": cat.requirement_key,
            "from_version_no": v.version_no,
            "to_version_no": current.version_no if current else None,
            "severity": _sev_name(sev),
        })
    superseded = worst >= _SEVERITY["minor"]
    return {
        "superseded": superseded,
        "supersede_severity": _sev_name(worst) if worst >= 0 else None,
        "drift": drift,
    }


def requirement_row_version_info(db: Session, req: Requirement) -> dict:
    """Version context for a single run requirement row (for Run Detail)."""
    out = {
        "requirement_version_no": None,
        "current_version_no": None,
        "superseded": False,
        "supersede_severity": None,
    }
    vid = getattr(req, "requirement_version_id", None)
    if not vid:
        return out
    v = db.get(RequirementVersion, vid)
    if not v:
        return out
    out["requirement_version_no"] = v.version_no
    cat = db.get(RequirementCatalog, v.requirement_id)
    if cat and cat.current_version_id:
        cur = db.get(RequirementVersion, cat.current_version_id)
        out["current_version_no"] = cur.version_no if cur else None
        if cat.current_version_id != v.id:
            newer = (
                db.query(RequirementVersion)
                .filter(RequirementVersion.requirement_id == cat.id,
                        RequirementVersion.version_no > v.version_no)
                .all()
            )
            if newer:
                sev = max(_SEVERITY.get(nv.change_class, 2) for nv in newer)
                out["superseded"] = sev >= _SEVERITY["minor"]
                out["supersede_severity"] = _sev_name(sev)
    return out


def _sev_name(level: int) -> Optional[str]:
    for name, lvl in _SEVERITY.items():
        if lvl == level:
            return name
    return None


# ─────────────────────────────────────────────
# Serializers + reads
# ─────────────────────────────────────────────

def version_to_dict(v: RequirementVersion) -> dict:
    return {
        "id": v.id, "requirement_id": v.requirement_id, "version_no": v.version_no,
        "statement": v.statement, "meta": v.meta, "content_hash": v.content_hash,
        "change_class": v.change_class, "change_reason": v.change_reason,
        "supersedes_version_id": v.supersedes_version_id,
        "author_id": v.author_id, "author_display": v.author_display,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


def catalog_to_dict(db: Session, c: RequirementCatalog) -> dict:
    cur = current_version(db, c)
    return {
        "id": c.id, "project_id": c.project_id, "requirement_key": c.requirement_key,
        "title": c.title, "archived": bool(c.archived),
        "current_version_no": cur.version_no if cur else None,
        "current_version_id": c.current_version_id,
        "statement": cur.statement if cur else None,
        "change_class": cur.change_class if cur else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def list_catalog(db: Session, project_id: str) -> list[dict]:
    cats = (
        db.query(RequirementCatalog)
        .filter(RequirementCatalog.project_id == project_id)
        .order_by(RequirementCatalog.requirement_key)
        .all()
    )
    return [catalog_to_dict(db, c) for c in cats]


def get_catalog_detail(db: Session, project_id: str, requirement_key: str) -> Optional[dict]:
    cat = get_catalog(db, project_id, requirement_key)
    if not cat:
        return None
    versions = (
        db.query(RequirementVersion)
        .filter(RequirementVersion.requirement_id == cat.id)
        .order_by(desc(RequirementVersion.version_no))
        .all()
    )
    events = (
        db.query(RequirementChangeEvent)
        .filter(RequirementChangeEvent.requirement_id == cat.id)
        .order_by(desc(RequirementChangeEvent.created_at))
        .all()
    )
    return {
        **catalog_to_dict(db, cat),
        "versions": [version_to_dict(v) for v in versions],
        "history": [change_event_to_dict(e) for e in events],
    }


def change_event_to_dict(e: RequirementChangeEvent) -> dict:
    return {
        "id": e.id, "requirement_id": e.requirement_id, "event_type": e.event_type,
        "from_version_id": e.from_version_id, "to_version_id": e.to_version_id,
        "change_class": e.change_class, "actor_id": e.actor_id, "actor_display": e.actor_display,
        "note": e.note, "impact_snapshot": e.impact_snapshot,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ─────────────────────────────────────────────
# Backfill (legacy per-run requirements → catalog)
# ─────────────────────────────────────────────

def backfill_requirement_catalog(db: Session) -> int:
    """Idempotently catalogue legacy requirement rows that have no version link.

    Groups by (project, requirement_key) in run-chronological order, synthesising
    the version chain by content hash. Only touches rows with a null
    ``requirement_version_id``. Returns the number of rows linked.
    """
    from services.db_service import _statement_of  # lazy: avoid import cycle

    rows = (
        db.query(Requirement, Run)
        .join(Run, Requirement.run_id == Run.id)
        .filter(Requirement.requirement_version_id.is_(None),
                Requirement.requirement_id.isnot(None))
        .order_by(Run.created_at)
        .all()
    )
    linked = 0
    for req, run in rows:
        key = (req.requirement_id or "").strip().upper()
        if not key or key == _REQ_UNKNOWN:
            continue
        catalog = get_or_create_catalog(db, run.project_id, key, title=(_statement_of(req) or "")[:200])
        version, _ = create_version(
            db, catalog, _statement_of(req), req.meta or {},
            author_id=None, author_display="Backfilled",
            change_reason="migrated from historical run", change_class="major",
            commit=False,
        )
        req.requirement_version_id = version.id
        linked += 1
    if linked:
        db.commit()
    return linked


# ─────────────────────────────────────────────
# Baselines
# ─────────────────────────────────────────────

def _latest_run_for_key(db: Session, project_id: str, requirement_key: str):
    """Latest run containing this requirement_key, preferring approved runs."""
    rows = (
        db.query(Requirement, Run)
        .join(Run, Requirement.run_id == Run.id)
        .filter(Run.project_id == project_id,
                Requirement.requirement_id == requirement_key,
                Run.status.in_(("complete", "warning")))
        .order_by(desc(Run.created_at))
        .all()
    )
    approved = [(req, run) for req, run in rows if run.review_state == "approved"]
    chosen = approved[0] if approved else (rows[0] if rows else None)
    return chosen  # (req, run) or None


def create_baseline(
    db: Session, project_id: str, name: str, note: Optional[str],
    actor_id: Optional[str], actor_display: str,
) -> dict:
    from services.db_service import tc_to_dict  # lazy

    if not name or not name.strip():
        return {"error": "baseline name is required"}
    if db.query(Baseline).filter(Baseline.project_id == project_id, Baseline.name == name.strip()).first():
        return {"error": f"Baseline '{name}' already exists in this project."}

    catalogs = (
        db.query(RequirementCatalog)
        .filter(RequirementCatalog.project_id == project_id, RequirementCatalog.archived.is_(False))
        .order_by(RequirementCatalog.requirement_key)
        .all()
    )
    baseline = Baseline(
        id=_uid(), project_id=project_id, name=name.strip(), note=note,
        created_by_id=actor_id, created_by_display=actor_display, created_at=datetime.utcnow(),
    )
    db.add(baseline)
    db.flush()

    digest_parts = []
    for cat in catalogs:
        cur = current_version(db, cat)
        if not cur:
            continue
        chosen = _latest_run_for_key(db, project_id, cat.requirement_key)
        snapshot, run_id, approval_state, coverage = [], None, None, None
        if chosen:
            _req, run = chosen
            run_id = run.id
            approval_state = run.review_state
            tcs = (
                db.query(TestCaseDB)
                .filter(TestCaseDB.run_id == run.id,
                        TestCaseDB.requirement_id == cat.requirement_key)
                .all()
            )
            snapshot = [tc_to_dict(tc) for tc in tcs]
            coverage = 100.0 if snapshot else 0.0
        item_digest = hashlib.sha256(
            json.dumps({"k": cat.requirement_key, "v": cur.version_no,
                        "h": cur.content_hash, "n": len(snapshot)}, sort_keys=True).encode()
        ).hexdigest()
        digest_parts.append(item_digest)
        db.add(BaselineItem(
            id=_uid(), baseline_id=baseline.id, requirement_id=cat.id,
            requirement_version_id=cur.id, requirement_key=cat.requirement_key,
            version_no=cur.version_no, statement=cur.statement, source_run_id=run_id,
            approval_state=approval_state, coverage_pct=coverage,
            test_case_count=len(snapshot), test_cases_snapshot=snapshot, items_digest=item_digest,
        ))
    baseline.content_digest = hashlib.sha256("".join(digest_parts).encode()).hexdigest()
    db.commit()
    return get_baseline_detail(db, baseline.id)


def list_baselines(db: Session, project_id: str) -> list[dict]:
    bls = (
        db.query(Baseline)
        .filter(Baseline.project_id == project_id)
        .order_by(desc(Baseline.created_at))
        .all()
    )
    return [baseline_to_dict(db, b, with_items=False) for b in bls]


def baseline_to_dict(db: Session, b: Baseline, with_items: bool = True) -> dict:
    items = (
        db.query(BaselineItem)
        .filter(BaselineItem.baseline_id == b.id)
        .order_by(BaselineItem.requirement_key)
        .all()
    )
    approved = sum(1 for it in items if it.approval_state == "approved")
    out = {
        "id": b.id, "project_id": b.project_id, "name": b.name, "note": b.note,
        "created_by_display": b.created_by_display, "created_by_id": b.created_by_id,
        "content_digest": b.content_digest,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "requirement_count": len(items), "approved_count": approved,
    }
    if with_items:
        out["items"] = [baseline_item_to_dict(it) for it in items]
    return out


def baseline_item_to_dict(it: BaselineItem) -> dict:
    return {
        "id": it.id, "requirement_key": it.requirement_key, "version_no": it.version_no,
        "statement": it.statement, "source_run_id": it.source_run_id,
        "approval_state": it.approval_state, "coverage_pct": it.coverage_pct,
        "test_case_count": it.test_case_count, "test_cases": it.test_cases_snapshot or [],
    }


def get_baseline_detail(db: Session, baseline_id: str) -> Optional[dict]:
    b = db.get(Baseline, baseline_id)
    if not b:
        return None
    return baseline_to_dict(db, b, with_items=True)


def diff_baselines(db: Session, a_id: str, b_id: str) -> dict:
    a = db.get(Baseline, a_id)
    b = db.get(Baseline, b_id)
    if not a or not b:
        return {"error": "baseline not found"}

    def _items(bid):
        return {
            it.requirement_key: it
            for it in db.query(BaselineItem).filter(BaselineItem.baseline_id == bid).all()
        }

    ia, ib = _items(a_id), _items(b_id)
    added, removed, modified, unchanged = [], [], [], []
    for key in sorted(set(ia) | set(ib)):
        x, y = ia.get(key), ib.get(key)
        if x and not y:
            removed.append({"requirement_key": key, "version_no": x.version_no})
        elif y and not x:
            added.append({"requirement_key": key, "version_no": y.version_no})
        elif x.version_no != y.version_no or x.items_digest != y.items_digest:
            modified.append({"requirement_key": key,
                             "from_version_no": x.version_no, "to_version_no": y.version_no})
        else:
            unchanged.append(key)
    return {
        "from_baseline": {"id": a.id, "name": a.name},
        "to_baseline": {"id": b.id, "name": b.name},
        "added": added, "removed": removed, "modified": modified,
        "unchanged_count": len(unchanged),
    }
