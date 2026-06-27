import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  GitBranch,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ElementType } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getProjectRuns } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { PageTransition } from "../../components/layout/PageTransition";
import type { Run } from "../../types";

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; Icon: ElementType }> = {
  complete: { label: "Complete", color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", Icon: CheckCircle2 },
  warning:  { label: "Warning",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)",  Icon: AlertCircle },
  running:  { label: "Running",  color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.25)",  Icon: Loader2 },
  failed:   { label: "Failed",   color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)", Icon: AlertCircle },
  error:    { label: "Failed",   color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)", Icon: AlertCircle },
};

// ─── RunCard ──────────────────────────────────────────────────────────────────

interface RunCardProps {
  run: Run;
  index: number;
  onOpen: () => void;
}

function RunCard({ run, index, onOpen }: RunCardProps) {
  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.error;
  const { Icon } = cfg;
  const openable = run.status !== "running";

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
      {/* Header row — click to open the run detail page */}
      <div
        onClick={openable ? onOpen : undefined}
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          cursor: openable ? "pointer" : "default",
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

        {/* Coverage % */}
        {(run.status === "complete" || run.status === "warning") && run.coverage_pct != null && (
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <span style={{
              fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.02em",
              color: run.coverage_pct === 100 ? "#10b981" : run.coverage_pct >= 80 ? "#f59e0b" : "#f87171",
            }}>
              {run.coverage_pct}%
            </span>
            <div style={{ fontSize: "0.625rem", color: "var(--c-text-3)" }}>coverage</div>
          </div>
        )}

        {/* Open / status indicator */}
        {openable ? (
          <span style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: "0.75rem", fontWeight: 600, color: "var(--c-accent)",
          }}>
            Open <ArrowRight size={14} />
          </span>
        ) : (
          <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", flexShrink: 0 }}>In progress…</span>
        )}
      </div>
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
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const completedRuns = runs.filter((r) => r.status === "complete" || r.status === "warning");
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
                onOpen={() => navigate(`/app/runs/${run.id}`)}
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
