import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  GitBranch,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { Link } from "react-router-dom";
import { getProjectRuns, getRunTestCases, getRunRequirements } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { PageTransition } from "../../components/layout/PageTransition";
import type { Run, TestCase } from "../../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(start: string, end?: string): string {
  try {
    const ms = new Date(end ?? new Date().toISOString()).getTime() - new Date(start).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  } catch {
    return "—";
  }
}

const STATUS_CONFIG = {
  complete: { label: "Complete", color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", Icon: CheckCircle2 },
  running:  { label: "Running",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  Icon: Loader2 },
  error:    { label: "Failed",   color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)", Icon: AlertCircle },
};

// ─── RunDetail — expanded content for a single run ────────────────────────────

interface RunDetailProps {
  run: Run;
}

function RunDetail({ run }: RunDetailProps) {
  const [testCases, setTestCases] = useState<TestCase[] | null>(null);
  const [requirements, setRequirements] = useState<{ id: string; text: string; position: number }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"cases" | "requirements">("cases");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [cases, reqs] = await Promise.all([
          getRunTestCases(run.id),
          getRunRequirements(run.id),
        ]);
        if (!cancelled) {
          setTestCases(cases);
          setRequirements(reqs);
        }
      } catch {
        if (!cancelled) {
          setTestCases([]);
          setRequirements([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [run.id]);

  const ASIL_COLORS: Record<string, string> = {
    QM: "#94a3b8", A: "#10b981", B: "#f59e0b", C: "#f97316", D: "#ef4444",
  };
  const TYPE_COLORS: Record<string, string> = {
    functional: "#818cf8", boundary: "#34d399", negative: "#f87171",
    fault_injection: "#fb923c", timing: "#60a5fa", safety: "#a78bfa",
    recovery: "#4ade80", stress: "#f472b6",
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
        <Loader2 size={20} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 0 4px" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--c-border)", paddingBottom: 0 }}>
        {(["cases", "requirements"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--c-accent)" : "2px solid transparent",
              color: tab === t ? "var(--c-accent)" : "var(--c-text-3)",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              marginBottom: -1,
            }}
          >
            {t === "cases"
              ? `Test Cases (${testCases?.length ?? 0})`
              : `Requirements (${requirements?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* Test Cases tab */}
      {tab === "cases" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {!testCases || testCases.length === 0 ? (
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", textAlign: "center", padding: "20px 0" }}>
              No test cases found for this run.
            </p>
          ) : (
            testCases.map((tc) => (
              <div
                key={tc.test_id}
                style={{
                  background: "var(--c-bg)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 10,
                  padding: "12px 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--c-text-3)", flexShrink: 0, paddingTop: 2 }}>
                    {tc.test_id}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--c-text)", flex: 1, lineHeight: 1.4 }}>
                    {tc.title}
                  </span>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <span style={{
                      fontSize: "0.6875rem", fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                      background: (ASIL_COLORS[tc.asil] ?? "#94a3b8") + "20",
                      color: ASIL_COLORS[tc.asil] ?? "#94a3b8",
                      border: `1px solid ${(ASIL_COLORS[tc.asil] ?? "#94a3b8")}40`,
                    }}>
                      {tc.asil}
                    </span>
                    <span style={{
                      fontSize: "0.6875rem", fontWeight: 600, padding: "2px 7px", borderRadius: 5,
                      background: (TYPE_COLORS[tc.test_type] ?? "#818cf8") + "15",
                      color: TYPE_COLORS[tc.test_type] ?? "#818cf8",
                      border: `1px solid ${(TYPE_COLORS[tc.test_type] ?? "#818cf8")}30`,
                    }}>
                      {tc.test_type.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {tc.steps.length > 0 && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--c-text-2)", lineHeight: 1.5 }}>
                    <span style={{ color: "var(--c-text-3)", fontWeight: 600, fontSize: "0.75rem", letterSpacing: "0.03em" }}>
                      STEPS&nbsp;
                    </span>
                    {tc.steps.slice(0, 2).map((s, i) => (
                      <span key={i} style={{ display: "block", paddingLeft: 12 }}>
                        {i + 1}. {s}
                      </span>
                    ))}
                    {tc.steps.length > 2 && (
                      <span style={{ color: "var(--c-text-3)", paddingLeft: 12, fontSize: "0.75rem" }}>
                        +{tc.steps.length - 2} more steps
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Requirements tab */}
      {tab === "requirements" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {!requirements || requirements.length === 0 ? (
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", textAlign: "center", padding: "20px 0" }}>
              No requirements found for this run.
            </p>
          ) : (
            requirements.map((req) => (
              <div
                key={req.id}
                style={{
                  background: "var(--c-bg)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span style={{
                  fontSize: "0.75rem", fontFamily: "monospace", color: "var(--c-text-3)",
                  flexShrink: 0, paddingTop: 2, minWidth: 32,
                }}>
                  #{req.position + 1}
                </span>
                <span style={{ fontSize: "0.875rem", color: "var(--c-text-2)", lineHeight: 1.5 }}>
                  {req.text}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── RunCard ──────────────────────────────────────────────────────────────────

interface RunCardProps {
  run: Run;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

function RunCard({ run, index, expanded, onToggle }: RunCardProps) {
  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.error;
  const { Icon } = cfg;

  const coverageTypes = [
    { key: "functional_count",      label: "Func",    color: "#818cf8" },
    { key: "boundary_count",        label: "Bound",   color: "#34d399" },
    { key: "negative_count",        label: "Neg",     color: "#f87171" },
    { key: "fault_injection_count", label: "Fault",   color: "#fb923c" },
    { key: "timing_count",          label: "Timing",  color: "#60a5fa" },
    { key: "safety_count",          label: "Safety",  color: "#a78bfa" },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-border)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {/* Header row — always visible */}
      <div
        onClick={run.status === "complete" ? onToggle : undefined}
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          cursor: run.status === "complete" ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {/* Status badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 8,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          flexShrink: 0,
        }}>
          <Icon
            size={13}
            color={cfg.color}
            style={run.status === "running" ? { animation: "spin 1s linear infinite" } : undefined}
          />
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: cfg.color, letterSpacing: "0.02em" }}>
            {cfg.label}
          </span>
        </div>

        {/* Metadata */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", letterSpacing: "-0.01em" }}>
              Run {run.created_at ? formatDate(run.created_at) : run.id.slice(0, 8)}
            </span>
            {run.provider && (
              <span style={{
                fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-text-3)",
                background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                padding: "1px 6px", borderRadius: 4,
              }}>
                {run.provider} / {run.model?.split("-").slice(0, 2).join("-")}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <MetaStat icon={GitBranch} value={`${run.requirement_count} reqs`} />
            <MetaStat icon={Sparkles} value={`${run.test_case_count} cases`} />
            {run.completed_at && (
              <MetaStat icon={Clock} value={formatDuration(run.created_at, run.completed_at)} />
            )}
          </div>
        </div>

        {/* Coverage pills */}
        {run.status === "complete" && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
            {coverageTypes.map(({ key, label, color }) => {
              const count = (run as unknown as Record<string, unknown>)[key] as number | undefined;
            if (!count) return null;
              return (
                <span key={key} style={{
                  fontSize: "0.6875rem", fontWeight: 600,
                  padding: "2px 6px", borderRadius: 5,
                  background: color + "15", color, border: `1px solid ${color}30`,
                }}>
                  {count} {label}
                </span>
              );
            })}
          </div>
        )}

        {/* Action links */}
        {run.status === "complete" && (
          <div
            style={{ display: "flex", gap: 4, flexShrink: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <Link
              to={`/app/test-cases?runId=${run.id}`}
              style={{
                fontSize: "0.6875rem", fontWeight: 600,
                padding: "3px 9px", borderRadius: 5, textDecoration: "none",
                background: "rgba(129,140,248,0.1)", color: "#818cf8",
                border: "1px solid rgba(129,140,248,0.25)",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(129,140,248,0.2)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(129,140,248,0.1)"; }}
            >
              Tests
            </Link>
            <Link
              to={`/app/traceability?runId=${run.id}`}
              style={{
                fontSize: "0.6875rem", fontWeight: 600,
                padding: "3px 9px", borderRadius: 5, textDecoration: "none",
                background: "rgba(96,165,250,0.1)", color: "#60a5fa",
                border: "1px solid rgba(96,165,250,0.25)",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.2)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.1)"; }}
            >
              Trace
            </Link>
          </div>
        )}

        {/* Expand chevron */}
        {run.status === "complete" && (
          <div style={{ flexShrink: 0, color: "var(--c-text-3)", transition: "transform 0.2s ease", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
            <ChevronDown size={16} />
          </div>
        )}
        {run.status === "running" && (
          <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", flexShrink: 0 }}>In progress…</span>
        )}
        {run.status === "error" && (
          <span style={{ fontSize: "0.75rem", color: "#f87171", flexShrink: 0, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {run.error ?? "Generation failed"}
          </span>
        )}
      </div>

      {/* Expanded detail panel */}
      <AnimatePresence initial={false}>
        {expanded && run.status === "complete" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid var(--c-border)", padding: "16px 20px" }}>
              <RunDetail run={run} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MetaStat({ icon: Icon, value }: { icon: ElementType; value: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8125rem", color: "var(--c-text-3)" }}>
      <Icon size={12} strokeWidth={2} />
      {value}
    </span>
  );
}

// ─── RunsPage ─────────────────────────────────────────────────────────────────

export default function RunsPage() {
  const { selectedProject } = useProject();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  async function loadRuns() {
    if (!selectedProject) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectRuns(selectedProject.id, 50);
      setRuns(data);
    } catch {
      setError("Could not load runs. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRuns(); }, [selectedProject]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const completedRuns = runs.filter((r) => r.status === "complete");
  const totalCases = completedRuns.reduce((s, r) => s + r.test_case_count, 0);
  const totalReqs = completedRuns.reduce((s, r) => s + r.requirement_count, 0);

  return (
    <PageTransition>
      <div style={{ padding: "36px 40px", maxWidth: 1100 }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <PlayCircle size={17} color="#34d399" strokeWidth={1.75} />
              </div>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>
                Run History
              </h1>
            </div>
            <p style={{ color: "var(--c-text-2)", fontSize: "0.875rem", margin: 0 }}>
              All generation runs for {selectedProject?.name ?? "—"}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={loadRuns}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                background: "var(--c-surface)", border: "1px solid var(--c-border)",
                color: "var(--c-text-2)", fontSize: "0.8125rem", fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
              }}
            >
              <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
              Refresh
            </button>
            <Link
              to="/app/generate"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)",
                color: "var(--c-accent)", fontSize: "0.8125rem", fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Sparkles size={13} />
              New Run
            </Link>
          </div>
        </div>

        {/* ── Summary stats ────────────────────────────────────── */}
        {!loading && runs.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10, marginBottom: 24 }}>
            {[
              { label: "Total Runs", value: runs.length, color: "#818cf8" },
              { label: "Test Cases Generated", value: totalCases, color: "#34d399" },
              { label: "Requirements Processed", value: totalReqs, color: "#60a5fa" },
            ].map((s) => (
              <div key={s.label} style={{
                background: "var(--c-surface)", border: "1px solid var(--c-border)",
                borderRadius: 12, padding: "16px 20px",
              }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-text-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 800, color: s.color, letterSpacing: "-0.03em" }}>
                  {s.value.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Loading state ────────────────────────────────────── */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={24} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* ── Error state ──────────────────────────────────────── */}
        {!loading && error && (
          <div style={{
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: 12, padding: "16px 20px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <AlertCircle size={16} color="#f87171" />
            <span style={{ color: "#f87171", fontSize: "0.875rem" }}>{error}</span>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────── */}
        {!loading && !error && runs.length === 0 && (
          <div style={{
            background: "var(--c-surface)", border: "1px solid var(--c-border)",
            borderRadius: 14, padding: "48px 32px",
            display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, marginBottom: 4,
              background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <PlayCircle size={22} color="#34d399" strokeWidth={1.75} />
            </div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--c-text)", margin: 0 }}>
              No runs yet
            </h3>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: 0, maxWidth: 360, lineHeight: 1.6 }}>
              Each time you generate test cases, the run is saved here with full results, metadata, and traceability.
            </p>
            <Link
              to="/app/generate"
              style={{
                marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6,
                padding: "9px 20px", borderRadius: 8,
                background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)",
                color: "var(--c-accent)", textDecoration: "none", fontSize: "0.8125rem", fontWeight: 600,
              }}
            >
              <Sparkles size={14} />
              Generate your first test suite
            </Link>
          </div>
        )}

        {/* ── Run list ─────────────────────────────────────────── */}
        {!loading && !error && runs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {runs.map((run, i) => (
              <RunCard
                key={run.id}
                run={run}
                index={i}
                expanded={expandedId === run.id}
                onToggle={() => toggleExpand(run.id)}
              />
            ))}
          </div>
        )}

      </div>

      {/* Spinner keyframes injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}
