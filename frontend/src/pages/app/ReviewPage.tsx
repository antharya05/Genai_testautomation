import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Edit3,
  GitBranch,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { downloadBlob, exportCsv, getProjectRuns, getRunTestCases, patchTestCaseReview } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { PageTransition } from "../../components/layout/PageTransition";
import type { Run, TestCase } from "../../types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = "pending" | "approved" | "rejected" | "needs_revision";

interface ReviewState {
  status: ReviewStatus;
  note: string;
  editedTitle: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ASIL_COLORS: Record<string, string> = {
  QM: "#94a3b8", A: "#10b981", B: "#f59e0b", C: "#f97316", D: "#ef4444",
};
const ASIL_BG: Record<string, string> = {
  QM: "rgba(148,163,184,0.1)", A: "rgba(16,185,129,0.1)",
  B: "rgba(245,158,11,0.1)", C: "rgba(249,115,22,0.1)", D: "rgba(239,68,68,0.1)",
};
const TYPE_COLORS: Record<string, string> = {
  functional: "#818cf8", boundary: "#34d399", negative: "#f87171",
  fault_injection: "#fb923c", timing: "#60a5fa", safety: "#a78bfa",
  recovery: "#4ade80", stress: "#f472b6",
};
const STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:        { label: "Pending Review", color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.18)" },
  approved:       { label: "Approved",       color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.22)" },
  rejected:       { label: "Rejected",       color: "#f87171", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.22)" },
  needs_revision: { label: "Needs Changes",  color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.22)" },
};

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return "—"; }
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({ label, active, activeColor, onClick }: {
  label: string; active: boolean; activeColor: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 8px", borderRadius: 6, fontSize: "0.68rem", fontWeight: 600,
        cursor: "pointer", fontFamily: "var(--font)", transition: "all 0.12s",
        background: active ? activeColor + "20" : "var(--c-bg-2)",
        border: `1px solid ${active ? activeColor + "50" : "var(--c-border)"}`,
        color: active ? activeColor : "var(--c-text-3)",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        if (!active) { el.style.borderColor = activeColor + "40"; el.style.color = activeColor; }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        if (!active) { el.style.borderColor = "var(--c-border)"; el.style.color = "var(--c-text-3)"; }
      }}
    >
      {label}
    </button>
  );
}

// ─── Review card ──────────────────────────────────────────────────────────────

function ReviewCard({ tc, review, selected, onToggleSelect, onSetStatus, onEditTitle, onSetNote, index }: {
  tc: TestCase;
  review: ReviewState;
  selected: boolean;
  onToggleSelect: () => void;
  onSetStatus: (s: ReviewStatus) => void;
  onEditTitle: (t: string) => void;
  onSetNote: (n: string) => void;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(review.editedTitle || tc.title);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(review.note);

  const cfg = STATUS_CONFIG[review.status];
  const asilColor = ASIL_COLORS[tc.asil] ?? "#94a3b8";

  function commitTitle() { setEditingTitle(false); onEditTitle(titleDraft); }
  function commitNote()  { setEditingNote(false);  onSetNote(noteDraft);   }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.25 }}
      style={{
        background: "var(--c-surface)", borderRadius: 13,
        border: `1px solid ${selected ? "rgba(129,140,248,0.45)" : review.status !== "pending" ? cfg.border : "var(--c-border)"}`,
        overflow: "hidden", transition: "border-color 0.18s",
      }}
    >
      {/* Card header */}
      <div style={{ padding: "11px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>

        {/* Checkbox */}
        <button
          onClick={onToggleSelect}
          title="Select"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: selected ? "var(--c-accent)" : "var(--c-text-3)",
            padding: "2px 0", flexShrink: 0, marginTop: 2,
            transition: "color 0.12s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--c-accent)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = selected ? "var(--c-accent)" : "var(--c-text-3)"; }}
        >
          {selected ? <CheckSquare size={15} /> : <Square size={15} />}
        </button>

        {/* IDs + badges */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, paddingTop: 1 }}>
          <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--c-accent)", letterSpacing: "0.03em" }}>
            {tc.test_id ?? `TC-${String(index + 1).padStart(4, "0")}`}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <span style={{
              fontSize: "0.6rem", fontWeight: 700, padding: "1px 5px", borderRadius: 4,
              background: ASIL_BG[tc.asil], color: asilColor,
              border: `1px solid ${asilColor}30`, letterSpacing: "0.03em",
            }}>
              {tc.asil === "QM" ? "QM" : `ASIL-${tc.asil}`}
            </span>
            <span style={{
              fontSize: "0.6rem", padding: "1px 5px", borderRadius: 4,
              background: (TYPE_COLORS[tc.test_type] ?? "#818cf8") + "14",
              color: TYPE_COLORS[tc.test_type] ?? "#818cf8",
              border: `1px solid ${(TYPE_COLORS[tc.test_type] ?? "#818cf8")}25`,
              textTransform: "capitalize",
            }}>
              {tc.test_type?.replace(/_/g, " ") ?? "—"}
            </span>
          </div>
        </div>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              onBlur={commitTitle}
              style={{
                width: "100%", padding: "4px 8px", borderRadius: 7, fontSize: "0.875rem", fontWeight: 600,
                background: "var(--c-bg-2)", border: "1px solid var(--c-accent)",
                color: "var(--c-text)", outline: "none", fontFamily: "var(--font)", boxSizing: "border-box",
              }}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", lineHeight: 1.4, flex: 1 }}>
                {review.editedTitle || tc.title}
              </span>
              <button
                onClick={() => setEditingTitle(true)}
                title="Edit title"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", padding: 2, flexShrink: 0, marginTop: 1 }}
              >
                <Edit3 size={12} />
              </button>
            </div>
          )}
          <div style={{ fontSize: "0.72rem", color: "var(--c-text-3)", marginTop: 3 }}>
            {tc.requirement_id ?? "—"}
            {tc.source_requirement_text ? ` · ${tc.source_requirement_text.slice(0, 65)}${tc.source_requirement_text.length > 65 ? "…" : ""}` : ""}
          </div>
        </div>

        {/* Right: status badge + actions + expand */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
          <span style={{
            fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: 5,
            background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
            letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
          }}>
            {cfg.label}
          </span>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <ActionBtn label="Approve" active={review.status === "approved"} activeColor="#10b981"
              onClick={() => onSetStatus(review.status === "approved" ? "pending" : "approved")} />
            <ActionBtn label="Revise" active={review.status === "needs_revision"} activeColor="#f59e0b"
              onClick={() => onSetStatus(review.status === "needs_revision" ? "pending" : "needs_revision")} />
            <ActionBtn label="Reject" active={review.status === "rejected"} activeColor="#f87171"
              onClick={() => onSetStatus(review.status === "rejected" ? "pending" : "rejected")} />
            <Link
              to="/app/generate"
              title="Regenerate for this requirement"
              style={{
                padding: "3px 8px", borderRadius: 6, fontSize: "0.68rem", fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font)", textDecoration: "none",
                background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                color: "var(--c-text-3)", display: "inline-flex", alignItems: "center", gap: 3,
                transition: "all 0.12s",
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = "var(--c-accent)"; el.style.borderColor = "var(--c-accent-glow)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = "var(--c-text-3)"; el.style.borderColor = "var(--c-border)"; }}
            >
              <RotateCcw size={10} />
              Regen
            </Link>
          </div>

          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", display: "flex", alignItems: "center", gap: 3, fontSize: "0.72rem", padding: 0 }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Collapse" : "Details"}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "12px 16px 14px", borderTop: "1px solid var(--c-border)", background: "var(--c-bg-2)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {[
                  { label: "Preconditions",   items: tc.preconditions,     color: "#818cf8" },
                  { label: "Test Steps",       items: tc.steps,             color: "#34d399" },
                  { label: "Expected Results", items: tc.expected_results,  color: "#60a5fa" },
                ].map(col => (
                  <div key={col.label}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: col.color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>
                      {col.label}
                    </div>
                    {(col.items ?? []).map((item, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5, alignItems: "flex-start" }}>
                        <span style={{ color: "var(--c-text-3)", flexShrink: 0, fontSize: "0.72rem", marginTop: 1 }}>{i + 1}.</span>
                        <span style={{ fontSize: "0.8rem", color: "var(--c-text-2)", lineHeight: 1.45 }}>{item}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--c-border)" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--c-text-3)", marginBottom: 5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  Review Note
                </div>
                {editingNote ? (
                  <textarea
                    autoFocus
                    value={noteDraft}
                    onChange={e => setNoteDraft(e.target.value)}
                    onBlur={commitNote}
                    rows={2}
                    placeholder="Add a review note…"
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8,
                      background: "var(--c-bg)", border: "1px solid var(--c-accent)",
                      color: "var(--c-text)", fontSize: "0.8rem", outline: "none",
                      fontFamily: "var(--font)", resize: "none",
                    }}
                  />
                ) : (
                  <div
                    onClick={() => { setNoteDraft(review.note); setEditingNote(true); }}
                    style={{
                      padding: "7px 10px", borderRadius: 8, cursor: "text",
                      background: "var(--c-bg)", border: "1px solid var(--c-border)",
                      minHeight: 32, fontSize: "0.8rem",
                      color: review.note ? "var(--c-text-2)" : "var(--c-text-3)",
                    }}
                  >
                    {review.note || "Click to add a review note…"}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const { selectedProject } = useProject();
  const [searchParams] = useSearchParams();
  const urlRunId = searchParams.get("runId");

  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(urlRunId);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [reviewMap, setReviewMap] = useState<Record<string, ReviewState>>({});
  const [filterStatus, setFilterStatus] = useState<ReviewStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  // Debounce note saves: { [test_id]: timeoutId }
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!selectedProject) return;
    async function loadRuns() {
      try {
        const r = await getProjectRuns(selectedProject!.id, 30);
        const completed = r.filter(run => run.status === "complete");
        setRuns(completed);
        if (!selectedRunId && completed.length > 0) setSelectedRunId(completed[0].id);
      } catch { /* ignore */ }
      finally { setLoadingRuns(false); }
    }
    loadRuns();
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedRunId) return;
    setLoadingCases(true);
    setTestCases([]);
    setSelected(new Set());
    getRunTestCases(selectedRunId)
      .then(tcs => {
        setTestCases(tcs);
        // Hydrate review state from DB-persisted fields
        const next: Record<string, ReviewState> = {};
        tcs.forEach(tc => {
          next[tc.test_id] = {
            status: (tc.review_status as ReviewStatus) ?? "pending",
            note: tc.review_note ?? "",
            editedTitle: tc.title,
          };
        });
        setReviewMap(next);
      })
      .catch(() => {})
      .finally(() => setLoadingCases(false));
  }, [selectedRunId]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

  function setStatus(id: string, status: ReviewStatus) {
    setReviewMap(prev => ({ ...prev, [id]: { ...(prev[id] ?? { status: "pending", note: "", editedTitle: "" }), status } }));
    patchTestCaseReview(id, status).catch(() => {});
  }
  function setTitle(id: string, title: string) {
    setReviewMap(prev => ({ ...prev, [id]: { ...(prev[id] ?? { status: "pending", note: "", editedTitle: title }), editedTitle: title } }));
  }
  function setNote(id: string, note: string) {
    setReviewMap(prev => ({ ...prev, [id]: { ...(prev[id] ?? { status: "pending", note: "", editedTitle: "" }), note } }));
    clearTimeout(noteTimers.current[id]);
    noteTimers.current[id] = setTimeout(() => {
      patchTestCaseReview(id, undefined, note).catch(() => {});
    }, 800);
  }
  function resetAll() {
    testCases.forEach(tc => {
      patchTestCaseReview(tc.test_id, "pending", "").catch(() => {});
    });
    setReviewMap(prev => {
      const next = { ...prev };
      testCases.forEach(tc => { next[tc.test_id] = { status: "pending", note: "", editedTitle: tc.title }; });
      return next;
    });
    setSelected(new Set());
  }

  // ─── Selection ─────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAll() { setSelected(new Set(filtered.map(tc => tc.test_id))); }
  function clearSelection() { setSelected(new Set()); }

  // ─── Bulk actions ───────────────────────────────────────────────────────────

  function bulkSetStatus(ids: Set<string>, status: ReviewStatus) {
    ids.forEach(id => { patchTestCaseReview(id, status).catch(() => {}); });
    setReviewMap(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = { ...(next[id] ?? { status: "pending", note: "", editedTitle: "" }), status }; });
      return next;
    });
    clearSelection();
  }

  async function exportApproved() {
    const approved = testCases.filter(tc => (reviewMap[tc.test_id]?.status ?? "pending") === "approved");
    if (approved.length === 0) return;
    setExporting(true);
    try {
      const blob = await exportCsv(approved, "approved_test_cases");
      downloadBlob(blob, "approved_test_cases.csv");
    } catch { /* ignore */ }
    finally { setExporting(false); }
  }

  // ─── Derived ───────────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    let pending = 0, approved = 0, rejected = 0, needs_revision = 0;
    testCases.forEach(tc => {
      const s = reviewMap[tc.test_id]?.status ?? "pending";
      if (s === "pending") pending++;
      else if (s === "approved") approved++;
      else if (s === "rejected") rejected++;
      else needs_revision++;
    });
    return { pending, approved, rejected, needs_revision };
  }, [reviewMap, testCases]);

  const filtered = testCases.filter(tc =>
    filterStatus === "all" ? true : (reviewMap[tc.test_id]?.status ?? "pending") === filterStatus
  );

  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null;
  const reviewComplete = testCases.length > 0 && counts.pending === 0;
  const allFilteredSelected = filtered.length > 0 && filtered.every(tc => selected.has(tc.test_id));

  return (
    <PageTransition>
      <div style={{ padding: "28px 32px 64px", maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <CheckCircle2 size={17} color="#818cf8" strokeWidth={1.75} />
            </div>
            <div>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>
                Review
              </h1>
              <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0 }}>
                Engineering QA review — approve, reject, or mark test cases for revision
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {counts.approved > 0 && (
              <button
                onClick={exportApproved}
                disabled={exporting}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)",
                  color: "#10b981", fontSize: "0.8125rem", fontFamily: "var(--font)",
                  fontWeight: 600, transition: "all 0.15s",
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(16,185,129,0.14)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(16,185,129,0.08)"; }}
              >
                {exporting ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={12} />}
                Export Approved ({counts.approved})
              </button>
            )}
            {testCases.length > 0 && (
              <button
                onClick={resetAll}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                  background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                  color: "var(--c-text-3)", fontSize: "0.8125rem", fontFamily: "var(--font)",
                }}
              >
                <RefreshCw size={12} />
                Reset
              </button>
            )}
            {runs.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--c-text-3)" }}>Run:</span>
                <select
                  value={selectedRunId ?? ""}
                  onChange={e => setSelectedRunId(e.target.value)}
                  style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: "0.8125rem", fontWeight: 500,
                    background: "var(--c-surface)", border: "1px solid var(--c-border)",
                    color: "var(--c-text)", fontFamily: "var(--font)", cursor: "pointer", outline: "none",
                  }}
                >
                  {runs.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.test_case_count} cases — {formatDate(r.created_at)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Loading */}
        {loadingRuns && (
          <div style={{ display: "flex", justifyContent: "center", padding: "72px 0" }}>
            <Loader2 size={20} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* No runs */}
        {!loadingRuns && runs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 16, padding: "60px 40px", textAlign: "center" }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 13, margin: "0 auto 18px", background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GitBranch size={22} color="#818cf8" strokeWidth={1.75} />
            </div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--c-text)", margin: "0 0 8px" }}>No completed runs to review</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--c-text-3)", margin: "0 0 22px", lineHeight: 1.6 }}>
              Generate test cases first — they'll appear here for review.
            </p>
            <Link to="/app/generate" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: "var(--c-accent)", color: "white", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600 }}>
              <Sparkles size={14} />
              Generate Test Cases
            </Link>
          </motion.div>
        )}

        {/* Main content */}
        {!loadingRuns && selectedRun && (
          <>
            {/* Run context strip */}
            <div style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 10, padding: "10px 16px", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>
                {selectedRun.test_case_count} test cases from {selectedRun.requirement_count} requirements
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{formatDate(selectedRun.created_at)}</span>
              {reviewComplete && (
                <span style={{
                  marginLeft: "auto", padding: "2px 10px", borderRadius: 5, fontSize: "0.7rem", fontWeight: 700,
                  background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#10b981",
                  letterSpacing: "0.04em",
                }}>
                  REVIEW COMPLETE
                </span>
              )}
            </div>

            {/* Summary cards (clickable filters) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
              {[
                { key: "pending"        as ReviewStatus, label: "Pending Review", value: counts.pending,        icon: Clock,          color: "#94a3b8" },
                { key: "approved"       as ReviewStatus, label: "Approved",       value: counts.approved,       icon: CheckCircle2,   color: "#10b981" },
                { key: "needs_revision" as ReviewStatus, label: "Needs Changes",  value: counts.needs_revision, icon: AlertTriangle,  color: "#f59e0b" },
                { key: "rejected"       as ReviewStatus, label: "Rejected",       value: counts.rejected,       icon: X,              color: "#f87171" },
              ].map(item => (
                <motion.button
                  key={item.key}
                  onClick={() => setFilterStatus(filterStatus === item.key ? "all" : item.key)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: filterStatus === item.key ? item.color + "10" : "var(--c-surface)",
                    border: `1px solid ${filterStatus === item.key ? item.color + "40" : "var(--c-border)"}`,
                    borderRadius: 12, padding: "12px 16px",
                    display: "flex", alignItems: "center", gap: 10,
                    cursor: "pointer", fontFamily: "var(--font)", textAlign: "left", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; if (filterStatus !== item.key) el.style.borderColor = item.color + "35"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; if (filterStatus !== item.key) el.style.borderColor = "var(--c-border)"; }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, background: item.color + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <item.icon size={14} color={item.color} strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--c-text)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                      {loadingCases ? <Loader2 size={13} color="var(--c-text-3)" style={{ animation: "spin 1s linear infinite" }} /> : item.value}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--c-text-3)", marginTop: 2, fontWeight: 500 }}>{item.label}</div>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Bulk action toolbar */}
            <AnimatePresence>
              {(selected.size > 0 || filtered.length > 0) && !loadingCases && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px", borderRadius: 9, marginBottom: 12,
                    background: selected.size > 0 ? "rgba(129,140,248,0.07)" : "var(--c-bg-2)",
                    border: `1px solid ${selected.size > 0 ? "rgba(129,140,248,0.25)" : "var(--c-border)"}`,
                    transition: "all 0.15s", flexWrap: "wrap",
                  }}
                >
                  {/* Select all toggle */}
                  <button
                    onClick={allFilteredSelected ? clearSelection : selectAll}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--c-text-3)", fontSize: "0.8125rem", fontFamily: "var(--font)", padding: 0,
                    }}
                  >
                    {allFilteredSelected
                      ? <CheckSquare size={14} color="var(--c-accent)" />
                      : <Square size={14} />
                    }
                    <span style={{ color: allFilteredSelected ? "var(--c-accent)" : "var(--c-text-3)" }}>
                      {allFilteredSelected ? "Deselect all" : "Select all"}
                    </span>
                  </button>

                  {selected.size > 0 && (
                    <>
                      <span style={{ width: 1, height: 16, background: "var(--c-border)", flexShrink: 0 }} />
                      <span style={{ fontSize: "0.8125rem", color: "var(--c-accent)", fontWeight: 600 }}>
                        {selected.size} selected
                      </span>
                      <button
                        onClick={() => bulkSetStatus(selected, "approved")}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
                          background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.28)",
                          color: "#10b981", cursor: "pointer", fontFamily: "var(--font)",
                        }}
                      >
                        <CheckCircle2 size={11} />
                        Approve Selected
                      </button>
                      <button
                        onClick={() => bulkSetStatus(selected, "rejected")}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
                          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                          color: "#f87171", cursor: "pointer", fontFamily: "var(--font)",
                        }}
                      >
                        <X size={11} />
                        Reject Selected
                      </button>
                      <button
                        onClick={() => bulkSetStatus(selected, "needs_revision")}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600,
                          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
                          color: "#f59e0b", cursor: "pointer", fontFamily: "var(--font)",
                        }}
                      >
                        <AlertTriangle size={11} />
                        Mark for Revision
                      </button>
                      <button
                        onClick={clearSelection}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", padding: 2, marginLeft: "auto" }}
                      >
                        <X size={13} />
                      </button>
                    </>
                  )}

                  {/* Filter indicator (right side when no selection) */}
                  {selected.size === 0 && filterStatus !== "all" && (
                    <>
                      <span style={{ width: 1, height: 16, background: "var(--c-border)", flexShrink: 0 }} />
                      <span style={{ fontSize: "0.8125rem", color: "var(--c-text-3)" }}>
                        Showing: <span style={{ color: STATUS_CONFIG[filterStatus].color, fontWeight: 600 }}>{STATUS_CONFIG[filterStatus].label}</span>
                        {" "}({filtered.length} of {testCases.length})
                      </span>
                      <button
                        onClick={() => setFilterStatus("all")}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", padding: 2, marginLeft: 2 }}
                      >
                        <X size={12} />
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Test case cards */}
            {loadingCases ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                <Loader2 size={18} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtered.map((tc, i) => (
                  <ReviewCard
                    key={tc.test_id}
                    tc={tc}
                    review={reviewMap[tc.test_id] ?? { status: "pending", note: "", editedTitle: tc.title }}
                    selected={selected.has(tc.test_id)}
                    onToggleSelect={() => toggleSelect(tc.test_id)}
                    onSetStatus={s => setStatus(tc.test_id, s)}
                    onEditTitle={t => setTitle(tc.test_id, t)}
                    onSetNote={n => setNote(tc.test_id, n)}
                    index={i}
                  />
                ))}
                {filtered.length === 0 && (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "var(--c-text-3)", fontSize: "0.875rem" }}>
                    No test cases match this filter.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}
