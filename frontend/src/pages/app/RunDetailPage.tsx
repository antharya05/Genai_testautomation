import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Download,
  FileSpreadsheet,
  FileText,
  GitBranch,
  ListChecks,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  downloadRunExport,
  getRun,
  getRunRequirements,
  getRunReviewSummary,
  getRunTestCases,
  getRunTraceability,
  getRunValidation,
} from "../../api/client";
import { PageTransition } from "../../components/layout/PageTransition";
import type { FailureType, Run, RunRequirement, RunReviewSummary, RunTraceability, RunValidation, TestCase } from "../../types";

// ─── Constants ──────────────────────────────────────────────────────────────

const ASIL_COLORS: Record<string, string> = {
  QM: "#94a3b8", A: "#10b981", B: "#f59e0b", C: "#f97316", D: "#ef4444",
};
const TYPE_COLORS: Record<string, string> = {
  functional: "#818cf8", boundary: "#34d399", negative: "#f87171",
  fault_injection: "#fb923c", timing: "#60a5fa", safety: "#a78bfa",
  recovery: "#4ade80", stress: "#f472b6",
};
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  complete: { label: "Complete", color: "#10b981" },
  warning:  { label: "Warning",  color: "#f59e0b" },
  failed:   { label: "Failed",   color: "#f87171" },
  error:    { label: "Failed",   color: "#f87171" },
  running:  { label: "Running",  color: "#60a5fa" },
};
const VAL_COLORS: Record<string, string> = {
  valid: "#10b981", warning: "#f59e0b", uncovered: "#f87171",
};
const REVIEW_COLORS: Record<string, string> = {
  approved: "#10b981", needs_revision: "#f59e0b", rejected: "#f87171", pending: "#94a3b8",
};
const FAILURE_LABEL: Record<FailureType, string> = {
  rate_limit: "Rate Limited", timeout: "Timeout", malformed_response: "Invalid Response",
  validation_failure: "Validation Failed", parsing_failure: "Parse Failed",
  provider_unavailable: "Provider Offline", unknown: "Error",
};

type TabKey = "overview" | "cases" | "validation" | "traceability" | "export";
const TABS: { key: TabKey; label: string; Icon: typeof ListChecks }[] = [
  { key: "overview", label: "Overview", Icon: Cpu },
  { key: "cases", label: "Test Cases", Icon: ListChecks },
  { key: "validation", label: "Validation", Icon: ShieldCheck },
  { key: "traceability", label: "Traceability", Icon: GitBranch },
  { key: "export", label: "Export", Icon: Download },
];

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [run, setRun] = useState<Run | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [trace, setTrace] = useState<RunTraceability | null>(null);
  const [validation, setValidation] = useState<RunValidation | null>(null);
  const [review, setReview] = useState<RunReviewSummary | null>(null);
  const [reqs, setReqs] = useState<RunRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const r = await getRun(runId);
        if ((r as unknown as { error?: string }).error || !r.id) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const [tcs, tr, val, rev, rqs] = await Promise.all([
          getRunTestCases(runId),
          getRunTraceability(runId),
          getRunValidation(runId),
          getRunReviewSummary(runId),
          getRunRequirements(runId),
        ]);
        if (!cancelled) { setRun(r); setCases(tcs); setTrace(tr); setValidation(val); setReview(rev); setReqs(rqs); }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [runId]);

  if (loading) {
    return (
      <PageTransition>
        <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
          <Loader2 size={24} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </PageTransition>
    );
  }

  if (notFound || !run) {
    return (
      <PageTransition>
        <div style={{ padding: "48px 40px", maxWidth: 700 }}>
          <button onClick={() => navigate("/app/runs")} style={backBtnStyle}>
            <ArrowLeft size={14} /> Back to Runs
          </button>
          <div style={{
            marginTop: 20, background: "var(--c-surface)", border: "1px solid var(--c-border)",
            borderRadius: 14, padding: "40px 28px", textAlign: "center",
          }}>
            <AlertCircle size={26} color="#f87171" style={{ marginBottom: 12 }} />
            <h2 style={{ fontSize: "1rem", color: "var(--c-text)", margin: "0 0 6px" }}>Run not found</h2>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: 0 }}>
              This run may have been deleted or belongs to another project.
            </p>
          </div>
        </div>
      </PageTransition>
    );
  }

  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.error;
  const coveragePct = run.coverage_pct ?? trace?.coverage_pct ?? 0;

  return (
    <PageTransition>
      <div style={{ padding: "28px 40px 64px", maxWidth: 1100 }}>

        {/* Back */}
        <button onClick={() => navigate("/app/runs")} style={backBtnStyle}>
          <ArrowLeft size={14} /> Back to Runs
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, margin: "16px 0 20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>
                Run {run.id.slice(0, 8)}
              </h1>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 8,
                background: cfg.color + "18", border: `1px solid ${cfg.color}40`,
                color: cfg.color, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.02em",
              }}>
                {run.status === "complete" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                {cfg.label}
              </span>
              {run.review_state && run.review_state !== "draft" && (() => {
                const gc: Record<string, { label: string; color: string }> = {
                  reviewed: { label: "Reviewed", color: "#60a5fa" },
                  approved: { label: "Approved", color: "#10b981" },
                  rejected: { label: "Rejected", color: "#f87171" },
                };
                const g = gc[run.review_state];
                if (!g) return null;
                return (
                  <span title={run.approved_by_display ? `by ${run.approved_by_display}` : undefined}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 8,
                      background: g.color + "18", border: `1px solid ${g.color}40`,
                      color: g.color, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.02em",
                    }}>
                    {run.locked && <Lock size={11} />}{g.label}
                  </span>
                );
              })()}
            </div>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0 }}>
              {formatDate(run.created_at)} · {run.provider ?? "—"} / {run.model ?? "—"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <ExportButton onClick={() => downloadRunExport(run.id, "excel")} icon={FileSpreadsheet} label="Excel" />
            <ExportButton onClick={() => downloadRunExport(run.id, "csv")} icon={FileText} label="CSV" />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--c-border)" }}>
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font)",
                borderBottom: tab === key ? "2px solid var(--c-accent)" : "2px solid transparent",
                color: tab === key ? "var(--c-accent)" : "var(--c-text-3)",
                fontWeight: 600, fontSize: "0.8125rem", marginBottom: -1,
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "overview" && <OverviewTab run={run} coveragePct={coveragePct} review={review} reqs={reqs} />}
        {tab === "cases" && <CasesTab cases={cases} />}
        {tab === "validation" && <ValidationTab validation={validation} />}
        {tab === "traceability" && <TraceabilityTab trace={trace} />}
        {tab === "export" && <ExportTab run={run} review={review} />}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ run, coveragePct, review, reqs }: { run: Run; coveragePct: number; review: RunReviewSummary | null; reqs: RunRequirement[] }) {
  const duration = run.generation_duration != null ? `${run.generation_duration.toFixed(1)}s` : "—";
  const failedReqs = reqs.filter((r) => r.generation_status === "generation_failed");
  const generatedCount = reqs.filter((r) => r.generation_status === "generated").length;
  const stats: { label: string; value: string | number; color?: string }[] = [
    { label: "Requirements", value: run.requirement_count },
    { label: "Test Cases", value: run.test_case_count },
    { label: "Coverage", value: `${coveragePct}%`, color: coveragePct === 100 ? "#10b981" : coveragePct >= 80 ? "#f59e0b" : "#f87171" },
    { label: "Failed Reqs", value: run.failed_requirement_count ?? 0, color: (run.failed_requirement_count ?? 0) > 0 ? "#f87171" : undefined },
    { label: "Duration", value: duration },
    { label: "Prompt", value: run.prompt_version ?? "—" },
  ];
  const coverageTypes = [
    { key: "functional_count", label: "Functional", color: "#818cf8" },
    { key: "boundary_count", label: "Boundary", color: "#34d399" },
    { key: "negative_count", label: "Negative", color: "#f87171" },
    { key: "fault_injection_count", label: "Fault Injection", color: "#fb923c" },
    { key: "timing_count", label: "Timing", color: "#60a5fa" },
    { key: "safety_count", label: "Safety", color: "#a78bfa" },
    { key: "recovery_count", label: "Recovery", color: "#4ade80" },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {run.reason && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)",
        }}>
          <AlertCircle size={15} color="#f59e0b" />
          <span style={{ fontSize: "0.8125rem", color: "var(--c-text-2)" }}>{run.reason}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {stats.map((s) => (
          <div key={s.label} style={cardStyle}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color: s.color ?? "var(--c-text)", letterSpacing: "-0.03em" }}>
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Generation outcome — Generated vs Failed, with the failed list + reasons */}
      {reqs.length > 0 && (
        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>Generation Outcome</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <span style={{
                fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                background: "#10b98115", color: "#10b981", border: "1px solid #10b98130",
              }}>
                Generated · {generatedCount}
              </span>
              <span style={{
                fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                background: failedReqs.length > 0 ? "#f8717115" : "var(--c-bg-2)",
                color: failedReqs.length > 0 ? "#f87171" : "var(--c-text-3)",
                border: `1px solid ${failedReqs.length > 0 ? "#f8717130" : "var(--c-border)"}`,
              }}>
                Failed · {failedReqs.length}
              </span>
            </span>
          </div>

          {failedReqs.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8125rem", color: "var(--c-text-3)" }}>
              <CheckCircle2 size={14} color="#10b981" /> Every requirement produced test cases.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {failedReqs.map((r) => (
                <div key={r.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8,
                  background: "var(--c-bg)", border: "1px solid var(--c-border)",
                }}>
                  <AlertCircle size={13} color="#f87171" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--c-accent)", flexShrink: 0, minWidth: 70 }}>
                    {r.requirement_id}
                  </span>
                  <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--c-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.failure_reason || r.statement || r.text}
                  </span>
                  {r.failure_type && (
                    <span style={pill("#f87171")}>{FAILURE_LABEL[r.failure_type]}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Requirement versions (Phase 4) */}
      {reqs.some((r) => r.requirement_version_no != null) && (
        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>Requirement Versions</span>
            {reqs.some((r) => r.superseded) && (
              <span style={pill("#f59e0b")}>superseded — requirement changed since generation</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {reqs.filter((r) => r.requirement_version_no != null).map((r) => (
              <div key={`v-${r.id}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.8rem" }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--c-accent)", minWidth: 90 }}>{r.requirement_id}</span>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(129,140,248,0.12)", color: "#818cf8" }}>
                  generated from v{r.requirement_version_no}
                </span>
                {r.superseded && r.current_version_no != null && (
                  <span style={{ fontSize: "0.72rem", color: "#f59e0b" }}>
                    → now v{r.current_version_no} ({r.supersede_severity})
                  </span>
                )}
                <span style={{ flex: 1, color: "var(--c-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.statement}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review summary */}
      {review && review.total > 0 && (
        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>Review Status</span>
            {review.review_complete && (
              <span style={pill("#10b981")}>review complete</span>
            )}
            {review.last_reviewed_at && (
              <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--c-text-3)" }}>
                last reviewed {formatDate(review.last_reviewed_at)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { label: "Approved", value: review.approved, color: "#10b981" },
              { label: "Needs Changes", value: review.needs_revision, color: "#f59e0b" },
              { label: "Rejected", value: review.rejected, color: "#f87171" },
              { label: "Pending", value: review.pending, color: "#94a3b8" },
            ].map((r) => (
              <span key={r.label} style={{
                fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                background: r.color + "15", color: r.color, border: `1px solid ${r.color}30`,
              }}>
                {r.label} · {r.value}
              </span>
            ))}
            <span style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 700, color: "#10b981" }}>
              {review.approved_pct}% approved
            </span>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div style={{ ...cardStyle, padding: "18px 20px" }}>
        <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 12 }}>Run Metadata</div>
        <MetaRow label="Run ID" value={run.id} mono />
        <MetaRow label="Created" value={formatDate(run.created_at)} />
        <MetaRow label="Completed" value={formatDate(run.completed_at)} />
        <MetaRow label="Provider" value={run.provider ?? "—"} />
        <MetaRow label="Model" value={run.model ?? "—"} mono />
        <MetaRow label="RAG enabled" value={run.rag_enabled ? "Yes" : "No"} />
        <MetaRow label="Errors" value={String(run.error_count ?? 0)} />
      </div>

      {/* Type coverage */}
      {run.status !== "failed" && run.test_case_count > 0 && (
        <div style={{ ...cardStyle, padding: "18px 20px" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 12 }}>Test Type Distribution</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {coverageTypes.map(({ key, label, color }) => {
              const count = (run as unknown as Record<string, number>)[key] ?? 0;
              if (!count) return null;
              return (
                <span key={key} style={{
                  fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                  background: color + "15", color, border: `1px solid ${color}30`,
                }}>
                  {label} · {count}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--c-border)" }}>
      <span style={{ fontSize: "0.8125rem", color: "var(--c-text-3)" }}>{label}</span>
      <span style={{ fontSize: "0.8125rem", color: "var(--c-text-2)", fontFamily: mono ? "var(--font-mono)" : "var(--font)", textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}

// ─── Test Cases (read-only) ─────────────────────────────────────────────────

function CasesTab({ cases }: { cases: TestCase[] }) {
  if (cases.length === 0) return <EmptyTab icon={ListChecks} text="No test cases were produced for this run." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {cases.map((tc) => (
        <details key={tc.test_id} style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <summary style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", listStyle: "none",
          }}>
            <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--c-text-3)", flexShrink: 0, minWidth: 60 }}>
              {tc.test_id}
            </span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: "0.875rem", color: "var(--c-text)", lineHeight: 1.4 }}>
              {tc.title}
            </span>
            <span style={pill(ASIL_COLORS[tc.asil] ?? "#94a3b8")}>{tc.asil}</span>
            <span style={pill(TYPE_COLORS[tc.test_type] ?? "#818cf8")}>{tc.test_type.replace(/_/g, " ")}</span>
            {tc.review_status && tc.review_status !== "pending" && (
              <span style={{ ...pill(REVIEW_COLORS[tc.review_status] ?? "#94a3b8"), textTransform: "capitalize" }}>
                {tc.review_status.replace(/_/g, " ")}
              </span>
            )}
            {tc.validation_status === "warning" && (
              <span style={pill("#f59e0b")}>warning</span>
            )}
            <ChevronDown size={14} color="var(--c-text-3)" />
          </summary>
          <div style={{ padding: "0 16px 14px 16px", borderTop: "1px solid var(--c-border)" }}>
            <StepBlock label="Requirement" items={[tc.requirement_id]} />
            {tc.preconditions && tc.preconditions.length > 0 && <StepBlock label="Preconditions" items={tc.preconditions} />}
            <StepBlock label="Steps" items={tc.steps} ordered />
            <StepBlock label="Expected Results" items={tc.expected_results} />
            {tc.coverage_warnings && tc.coverage_warnings.length > 0 && (
              <StepBlock label="Validation warnings" items={tc.coverage_warnings} warn />
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function StepBlock({ label, items, ordered, warn }: { label: string; items: string[]; ordered?: boolean; warn?: boolean }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: warn ? "#f59e0b" : "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
        {label}
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ fontSize: "0.8125rem", color: warn ? "#f59e0b" : "var(--c-text-2)", lineHeight: 1.5, paddingLeft: 8 }}>
          {ordered ? `${i + 1}. ` : "• "}{it}
        </div>
      ))}
    </div>
  );
}

// ─── Validation (persisted snapshot, not re-derived) ──────────────────────────

function ValidationTab({ validation }: { validation: RunValidation | null }) {
  if (!validation || validation.total === 0) return <EmptyTab icon={ShieldCheck} text="No validation data for this run." />;
  const s = validation.requirement_summary;
  const tc = validation.test_case_summary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        <SummaryCard label="Coverage" value={`${validation.coverage_pct}%`} color={validation.coverage_pct === 100 ? "#10b981" : validation.coverage_pct >= 80 ? "#f59e0b" : "#f87171"} />
        <SummaryCard label="Valid" value={s.valid} color="#10b981" />
        <SummaryCard label="Warnings" value={s.warning} color="#f59e0b" />
        <SummaryCard label="Uncovered" value={s.uncovered} color="#f87171" />
        <SummaryCard label="Cases (valid/warn)" value={`${tc.valid}/${tc.warning}`} />
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--c-border)", fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>
          Requirement Validation
          <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--c-text-3)", fontWeight: 400 }}>
            persisted from generation — not re-run
          </span>
        </div>
        {validation.requirements.map((r) => {
          const color = VAL_COLORS[r.validation_status] ?? "#94a3b8";
          return (
            <div key={`${r.requirement_id}-${r.position}`} style={{ padding: "11px 18px", borderBottom: "1px solid var(--c-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--c-accent)", flexShrink: 0, minWidth: 70 }}>
                  {r.requirement_id}
                </span>
                <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--c-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.statement}
                </span>
                <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>{r.test_case_count} cases</span>
                <span style={{ ...pill(color), textTransform: "capitalize" }}>{r.validation_status}</span>
              </div>
              {r.coverage_warnings.length > 0 && (
                <div style={{ paddingLeft: 88, marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {r.coverage_warnings.map((w, i) => (
                    <span key={i} style={{ fontSize: "0.75rem", color: "#f59e0b" }}>⚠ {w}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Traceability (persisted snapshot) ────────────────────────────────────────

function TraceabilityTab({ trace }: { trace: RunTraceability | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (!trace || trace.total === 0) return <EmptyTab icon={GitBranch} text="No traceability data for this run." />;

  const color = trace.coverage_pct === 100 ? "#10b981" : trace.coverage_pct >= 80 ? "#f59e0b" : "#f87171";

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...cardStyle, padding: "14px 18px", display: "flex", alignItems: "center", gap: 20 }}>
        <div>
          <div style={{ fontSize: "1.875rem", fontWeight: 800, color, letterSpacing: "-0.035em", lineHeight: 1 }}>
            {trace.coverage_pct}%
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 2 }}>coverage</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--c-text-2)", marginBottom: 6 }}>
            {trace.covered} of {trace.total} requirements covered
          </div>
          <div style={{ height: 6, background: "var(--c-border)", borderRadius: 4 }}>
            <div style={{ height: "100%", borderRadius: 4, width: `${trace.coverage_pct}%`, background: color }} />
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {trace.requirements.map((r) => {
          const isOpen = expanded.has(r.id);
          const linked = r.linked_test_cases ?? [];
          return (
            <div key={r.id} style={{ borderBottom: "1px solid var(--c-border)" }}>
              <div
                onClick={() => linked.length > 0 && toggle(r.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 18px",
                  cursor: linked.length > 0 ? "pointer" : "default",
                }}
              >
                {r.covered
                  ? <CheckCircle2 size={14} color="#10b981" style={{ flexShrink: 0 }} />
                  : <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0 }} />}
                <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--c-accent)", flexShrink: 0, minWidth: 70 }}>
                  {r.requirement_id}
                </span>
                <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--c-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.statement || r.text}
                </span>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: r.covered ? "var(--c-text)" : "var(--c-text-3)" }}>
                  {r.test_case_count}
                </span>
              </div>
              {isOpen && linked.length > 0 && (
                <div style={{ background: "var(--c-bg-2)", padding: "8px 18px 12px 42px", display: "flex", flexDirection: "column", gap: 5 }}>
                  {linked.map((tc) => (
                    <div key={tc.test_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--c-text-3)", minWidth: 64 }}>
                        {tc.test_id}
                      </span>
                      <span style={{ flex: 1, fontSize: "0.8125rem", color: "var(--c-text)" }}>{tc.title}</span>
                      <span style={pill(ASIL_COLORS[tc.asil] ?? "#94a3b8")}>{tc.asil}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

function ExportTab({ run, review }: { run: Run; review: RunReviewSummary | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const approvedCount = review?.approved ?? 0;
  async function run_export(fmt: "excel" | "csv") {
    setBusy(fmt);
    try { await downloadRunExport(run.id, fmt, approvedOnly ? "approved" : undefined); } finally { setBusy(null); }
  }
  const options = [
    { fmt: "excel" as const, Icon: FileSpreadsheet, title: "Excel Workbook", desc: "Test cases + traceability matrix (.xlsx)" },
    { fmt: "csv" as const, Icon: FileText, title: "JIRA / Xray CSV", desc: "Importable test issues (.csv)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10,
        background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)",
      }}>
        <CheckCircle2 size={15} color="#10b981" />
        <span style={{ fontSize: "0.8125rem", color: "var(--c-text-2)" }}>
          Exports are reconstructed from the persisted run — no regeneration, available any time.
        </span>
      </div>

      {/* Approved-only toggle */}
      <label style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10,
        background: "var(--c-surface)", border: "1px solid var(--c-border)", cursor: approvedCount > 0 ? "pointer" : "not-allowed",
        opacity: approvedCount > 0 ? 1 : 0.6,
      }}>
        <input
          type="checkbox"
          checked={approvedOnly}
          disabled={approvedCount === 0}
          onChange={(e) => setApprovedOnly(e.target.checked)}
          style={{ accentColor: "#10b981", width: 15, height: 15 }}
        />
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>Approved only</span>
        <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>
          {approvedCount > 0 ? `export the ${approvedCount} approved test case${approvedCount === 1 ? "" : "s"}` : "no approved test cases yet"}
        </span>
      </label>
      {options.map(({ fmt, Icon, title, desc }) => (
        <div key={fmt} style={{ ...cardStyle, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={18} color="var(--c-accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>{title}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{desc}</div>
          </div>
          <button onClick={() => run_export(fmt)} disabled={busy !== null} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8,
            background: "var(--c-accent)", border: "1px solid var(--c-accent)", color: "white",
            fontSize: "0.8125rem", fontWeight: 600, fontFamily: "var(--font)",
            cursor: busy ? "wait" : "pointer", opacity: busy && busy !== fmt ? 0.5 : 1,
          }}>
            {busy === fmt ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
            Export
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

const backBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
  background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-2)",
  fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
};
const cardStyle: React.CSSProperties = {
  background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: "14px 16px",
};
function pill(color: string): React.CSSProperties {
  return {
    fontSize: "0.6875rem", fontWeight: 700, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
    background: color + "1a", color, border: `1px solid ${color}40`,
  };
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: "1.375rem", fontWeight: 800, color: color ?? "var(--c-text)", letterSpacing: "-0.03em" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function ExportButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof FileText; label: string }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
      background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-2)",
      fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
    }}>
      <Icon size={14} /> {label}
    </button>
  );
}

function EmptyTab({ icon: Icon, text }: { icon: typeof ListChecks; text: string }) {
  return (
    <div style={{ ...cardStyle, padding: "40px 28px", textAlign: "center" }}>
      <Icon size={24} color="var(--c-text-3)" style={{ marginBottom: 10 }} />
      <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: 0 }}>{text}</p>
      <Link to="/app/generate" style={{ color: "var(--c-accent)", fontSize: "0.8125rem", textDecoration: "none", display: "inline-block", marginTop: 8 }}>
        Generate a new run →
      </Link>
    </div>
  );
}
