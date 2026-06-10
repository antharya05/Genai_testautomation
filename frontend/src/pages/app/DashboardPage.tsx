import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  FolderOpen,
  GitBranch,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createProject, getProjectRuns, getProjectStats, getRunTestCases } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { PageTransition } from "../../components/layout/PageTransition";
import type { Project, ProjectStats, Run, TestCase } from "../../types";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch { return "—"; }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

// ─── Color palettes ───────────────────────────────────────────────────────────

const ASIL_COLORS: Record<string, string> = {
  D: "#ef4444", C: "#f97316", B: "#f59e0b", A: "#10b981", QM: "#4A587A",
};

const TYPE_COLORS: Record<string, string> = {
  functional:     "#818CF8",
  boundary:       "#a78bfa",
  negative:       "#f87171",
  fault_injection:"#f59e0b",
  timing:         "#06b6d4",
  safety:         "#10b981",
  recovery:       "#34d399",
  stress:         "#f472b6",
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  complete: { color: "#10b981", label: "Complete" },
  running:  { color: "#f59e0b", label: "Running"  },
  error:    { color: "#ef4444", label: "Failed"   },
};

// ─── SVG Donut Chart ──────────────────────────────────────────────────────────

interface DonutSeg { label: string; value: number; color: string }

function DonutChart({
  segments, centerText, centerSub, size = 120, strokeW = 13,
}: {
  segments: DonutSeg[];
  centerText: string | number;
  centerSub: string;
  size?: number;
  strokeW?: number;
}) {
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - strokeW;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, d) => s + d.value, 0);
  const GAP = total > 1 ? 2 : 0;

  let cumFrac = 0;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeW} />
      {/* Segments */}
      {total > 0 && segments.map(seg => {
        if (seg.value === 0) return null;
        const frac = seg.value / total;
        const startAngle = cumFrac * 360 - 90;
        const dashLen = Math.max(0, frac * circ - GAP);
        cumFrac += frac;
        return (
          <circle
            key={seg.label}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeW - 1}
            strokeDasharray={`${dashLen} ${circ}`}
            strokeDashoffset={0}
            transform={`rotate(${startAngle} ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
      })}
      {/* Center */}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="var(--c-text)"
        fontSize="17" fontWeight="700" fontFamily="var(--font)">
        {centerText}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--c-text-3)"
        fontSize="9" fontFamily="var(--font)" letterSpacing="0.08em">
        {centerSub.toUpperCase()}
      </text>
    </svg>
  );
}

// ─── Chart Legend ─────────────────────────────────────────────────────────────

function ChartLegend({ items }: { items: DonutSeg[] }) {
  const total = items.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
      {items.map(seg => (
        <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            width: 8, height: 8, borderRadius: 2, flexShrink: 0,
            background: seg.color,
          }} />
          <span style={{
            flex: 1, fontSize: "0.75rem", color: "var(--c-text-2)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textTransform: "capitalize",
          }}>
            {seg.label.replace(/_/g, " ")}
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
            {seg.value}
          </span>
          {total > 0 && (
            <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", minWidth: 32, textAlign: "right", flexShrink: 0 }}>
              {Math.round((seg.value / total) * 100)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, color, loading, suffix,
}: {
  label: string;
  value: number | string | null;
  icon: typeof Sparkles;
  color: string;
  loading?: boolean;
  suffix?: string;
}) {
  return (
    <div style={{
      background: "var(--c-surface)", border: "1px solid var(--c-border)",
      borderRadius: 12, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: color + "14",
        border: `1px solid ${color}22`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} color={color} strokeWidth={1.75} />
      </div>
      <div>
        <div style={{
          fontSize: "1.5rem", fontWeight: 800, color: "var(--c-text)",
          lineHeight: 1, letterSpacing: "-0.035em",
          display: "flex", alignItems: "baseline", gap: 3,
        }}>
          {loading
            ? <Loader2 size={14} color="var(--c-text-3)" style={{ animation: "spin 1s linear infinite" }} />
            : <>{(value ?? 0).toLocaleString()}{suffix && <span style={{ fontSize: "0.875rem", fontWeight: 600, color: color }}>{suffix}</span>}</>
          }
        </div>
        <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 3, fontWeight: 500 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── Section Card ──────────────────────────────────────────────────────────────

function SectionCard({
  title, action, children,
}: {
  title: string;
  action?: { label: string; to: string };
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--c-surface)", border: "1px solid var(--c-border)",
      borderRadius: 12, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "13px 18px", borderBottom: "1px solid var(--c-border)",
      }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>
          {title}
        </span>
        {action && (
          <Link to={action.to} style={{
            fontSize: "0.75rem", color: "var(--c-accent)",
            fontWeight: 500, textDecoration: "none",
          }}>
            {action.label}
          </Link>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressRow({ label, value, max, color }: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "0.75rem", color: "var(--c-text-2)", textTransform: "capitalize" }}>
          {label.replace(/_/g, " ")}
        </span>
        <span style={{ fontSize: "0.75rem", color, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
          {value}
        </span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 2, background: color }}
        />
      </div>
    </div>
  );
}

// ─── New Project Modal ────────────────────────────────────────────────────────

function NewProjectModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Project name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const project = await createProject(name.trim(), description.trim() || undefined);
      onCreated(project);
    } catch {
      setError("Failed to create project. Is the backend running?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, backdropFilter: "blur(4px)" }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 201, width: "100%", maxWidth: 440, padding: "0 20px" }}
      >
        <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 72px rgba(0,0,0,0.45)" }}>
          <div style={{ padding: "15px 18px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <FolderOpen size={14} color="var(--c-accent)" strokeWidth={1.75} />
              </div>
              <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--c-text)" }}>New Project</span>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", display: "flex", padding: 4, borderRadius: 5 }}>
              <X size={15} />
            </button>
          </div>
          <form onSubmit={handleCreate} style={{ padding: "18px" }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "var(--c-text-2)", marginBottom: 5 }}>
                Project Name <span style={{ color: "var(--c-accent)" }}>*</span>
              </label>
              <input
                ref={nameRef} type="text" value={name}
                onChange={e => { setName(e.target.value); setError(""); }}
                placeholder="e.g. AEB Safety Validation"
                style={{ width: "100%", padding: "8px 11px", borderRadius: 8, boxSizing: "border-box", background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontSize: "0.875rem", outline: "none", fontFamily: "var(--font)", transition: "border-color 0.15s" }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-accent)"; }}
                onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border)"; }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 500, color: "var(--c-text-2)", marginBottom: 5 }}>
                Description <span style={{ color: "var(--c-text-3)", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Scope and objectives for this project"
                rows={2}
                style={{ width: "100%", padding: "8px 11px", borderRadius: 8, boxSizing: "border-box", background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontSize: "0.875rem", outline: "none", fontFamily: "var(--font)", resize: "vertical", minHeight: 60, transition: "border-color 0.15s" }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-accent)"; }}
                onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border)"; }}
              />
            </div>
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "7px 11px", borderRadius: 7, marginBottom: 12, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontSize: "0.8rem", color: "#fca5a5" }}>
                {error}
              </motion.div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={{ padding: "7px 14px", borderRadius: 7, cursor: "pointer", background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-2)", fontSize: "0.875rem", fontFamily: "var(--font)" }}>
                Cancel
              </button>
              <button type="submit" disabled={saving || !name.trim()} style={{ padding: "7px 16px", borderRadius: 7, cursor: saving || !name.trim() ? "not-allowed" : "pointer", background: saving || !name.trim() ? "var(--c-surface-2)" : "var(--c-accent)", border: "none", color: saving || !name.trim() ? "var(--c-text-3)" : "white", fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font)", display: "flex", alignItems: "center", gap: 5 }}>
                {saving ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={12} />}
                {saving ? "Creating…" : "Create Project"}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, description, action }: {
  icon: typeof FolderOpen;
  title: string;
  description: string;
  action?: { label: string; to?: string; onClick?: () => void };
}) {
  return (
    <div style={{ padding: "32px 24px", textAlign: "center" }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--c-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
        <Icon size={18} color="var(--c-text-3)" strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: "0.8rem", color: "var(--c-text-3)", marginBottom: action ? 14 : 0, lineHeight: 1.55 }}>{description}</div>
      {action && (
        action.to
          ? <Link to={action.to} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 7, background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)", color: "var(--c-accent)", textDecoration: "none", fontSize: "0.8rem", fontWeight: 600 }}>
              {action.label}
            </Link>
          : <button onClick={action.onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 7, background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)", color: "var(--c-accent)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, fontFamily: "var(--font)" }}>
              {action.label}
            </button>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { projects, selectedProject, refreshProjects } = useProject();
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [lastRunCases, setLastRunCases] = useState<TestCase[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);

  async function loadAll() {
    if (!selectedProject) { setLoading(false); return; }
    try {
      const [s, r] = await Promise.all([
        getProjectStats(selectedProject.id),
        getProjectRuns(selectedProject.id, 10),
      ]);
      setStats(s);
      setRuns(r);
      const lastCompleted = r.find(run => run.status === "complete");
      if (lastCompleted) {
        try {
          const tcs = await getRunTestCases(lastCompleted.id);
          setLastRunCases(tcs);
        } catch { /* no test cases */ }
      }
    } catch { /* backend offline */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setStats(null); setRuns([]); setLastRunCases(null);
    loadAll().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [selectedProject]);

  async function handleProjectCreated(p: Project) {
    setShowNewProject(false);
    await refreshProjects();
  }

  // ── Derived analytics ────────────────────────────────────────────────────────

  const completedRuns = runs.filter(r => r.status === "complete");

  // ASIL distribution from last run's test cases
  const asilSegments: DonutSeg[] = lastRunCases
    ? (["D", "C", "B", "A", "QM"] as const)
        .map(level => ({
          label: `ASIL-${level}`,
          value: lastRunCases.filter(tc => tc.asil === level).length,
          color: ASIL_COLORS[level],
        }))
        .filter(s => s.value > 0)
    : [];

  // Test type distribution from last completed run's counts
  const lastCompleted = completedRuns[0] ?? null;
  const typeSegments: DonutSeg[] = lastCompleted
    ? (Object.entries({
        functional:     lastCompleted.functional_count ?? 0,
        boundary:       lastCompleted.boundary_count ?? 0,
        negative:       lastCompleted.negative_count ?? 0,
        timing:         lastCompleted.timing_count ?? 0,
        fault_injection:lastCompleted.fault_injection_count ?? 0,
        safety:         lastCompleted.safety_count ?? 0,
        recovery:       lastCompleted.recovery_count ?? 0,
      }) as [string, number][])
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ label: k, value: v, color: TYPE_COLORS[k] ?? "#818CF8" }))
    : [];

  // Review summary from last run's test cases
  const reviewApproved = lastRunCases ? lastRunCases.filter(tc => tc.review_status === "approved").length : 0;
  const reviewPending  = lastRunCases ? lastRunCases.filter(tc => !tc.review_status || tc.review_status === "pending").length : 0;
  const reviewRejected = lastRunCases ? lastRunCases.filter(tc => tc.review_status === "rejected").length : 0;
  const reviewTotal    = reviewApproved + reviewPending + reviewRejected;

  // Approximate requirement coverage: reqs touched across completed runs vs stats
  const coveredReqs = completedRuns.reduce((s, r) => Math.max(s, r.requirement_count), 0);
  const totalReqs   = stats?.total_requirements ?? 0;
  const coveragePct = totalReqs > 0 ? Math.min(100, Math.round((coveredReqs / totalReqs) * 100)) : null;

  // Validation issues: error runs + rejected test cases
  const errorRuns    = runs.filter(r => r.status === "error").length;
  const issueCount   = errorRuns + reviewRejected;

  const hasData = !loading && selectedProject !== null;

  // Two-column grid for charts
  const col2 = isMobile ? "1fr" : "1fr 1fr";

  return (
    <PageTransition>
      <div style={{ padding: "24px 28px 48px", maxWidth: 1280 }}>

        {/* ── Header ────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>
              Analytics Dashboard
            </h1>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.8rem", margin: "3px 0 0" }}>
              {selectedProject ? selectedProject.name : "Select a project from the top bar"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowNewProject(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 7, background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-2)", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, fontFamily: "var(--font)", transition: "all 0.15s" }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--c-border-2)"; el.style.color = "var(--c-text)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--c-border)"; el.style.color = "var(--c-text-2)"; }}
            >
              <Plus size={12} /> New Project
            </button>
            <Link to="/app/generate" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 7, background: "var(--c-accent)", color: "white", textDecoration: "none", fontSize: "0.8rem", fontWeight: 600 }}>
              <Sparkles size={12} /> New Run
            </Link>
          </div>
        </div>

        {/* ── KPI Strip ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
          {(
            [
              { label: "Requirements",    value: stats?.total_requirements, icon: FileText,      color: "#34d399" },
              { label: "Test Cases",      value: stats?.total_test_cases,   icon: Sparkles,      color: "#a78bfa" },
              { label: "Total Runs",      value: stats?.total_runs,         icon: GitBranch,     color: "#60a5fa" },
              { label: "Coverage",        value: coveragePct,               icon: CheckCircle2,  color: "#10b981", suffix: coveragePct !== null ? "%" : undefined },
              { label: "Open Issues",     value: issueCount,                icon: AlertTriangle, color: issueCount > 0 ? "#f59e0b" : "#4A587A" },
            ] as { label: string; value: number | null; icon: typeof Sparkles; color: string; suffix?: string }[]
          ).map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <KpiCard
                label={item.label}
                value={item.value}
                icon={item.icon}
                color={item.color}
                loading={loading}
                suffix={item.suffix}
              />
            </motion.div>
          ))}
        </div>

        {/* ── Charts Row ────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: col2, gap: 12, marginBottom: 12 }}>

          {/* ASIL Distribution */}
          <SectionCard title="ASIL Distribution">
            <div style={{ padding: "16px 18px" }}>
              {!hasData ? (
                <EmptyState icon={GitBranch} title="No data yet" description="Complete a generation run to see ASIL distribution." />
              ) : asilSegments.length === 0 ? (
                <EmptyState icon={GitBranch} title="No ASIL data" description="Run a generation to see ASIL classification." />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <DonutChart
                    segments={asilSegments}
                    centerText={lastRunCases?.length ?? 0}
                    centerSub="Test Cases"
                    size={120}
                    strokeW={13}
                  />
                  <ChartLegend items={asilSegments} />
                </div>
              )}
            </div>
          </SectionCard>

          {/* Test Type Distribution */}
          <SectionCard title="Test Type Distribution">
            <div style={{ padding: "16px 18px" }}>
              {!hasData ? (
                <EmptyState icon={Sparkles} title="No data yet" description="Complete a generation run to see test type breakdown." />
              ) : typeSegments.length === 0 ? (
                <EmptyState icon={Sparkles} title="No run data" description="Run a generation to see test type breakdown." />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <DonutChart
                    segments={typeSegments}
                    centerText={typeSegments.reduce((s, d) => s + d.value, 0)}
                    centerSub="Total"
                    size={120}
                    strokeW={13}
                  />
                  <ChartLegend items={typeSegments} />
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── Second Row ────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: col2, gap: 12, marginBottom: 12 }}>

          {/* Requirement Coverage */}
          <SectionCard title="Requirement Coverage">
            <div style={{ padding: "16px 18px" }}>
              {!hasData || totalReqs === 0 ? (
                <EmptyState icon={CheckCircle2} title="No requirements" description="Upload requirements and run a generation to see coverage." />
              ) : (
                <>
                  <ProgressRow label="Covered" value={coveredReqs} max={totalReqs} color="#10b981" />
                  <ProgressRow label="Total Requirements" value={totalReqs} max={totalReqs} color="#4A587A" />
                  <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--c-text-2)" }}>Coverage Rate</span>
                      <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#10b981", letterSpacing: "-0.03em" }}>
                        {coveragePct ?? "—"}{coveragePct !== null ? "%" : ""}
                      </span>
                    </div>
                    {completedRuns.length > 0 && (
                      <div style={{ fontSize: "0.7rem", color: "var(--c-text-3)", marginTop: 3 }}>
                        Based on {completedRuns.length} completed run{completedRuns.length !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </SectionCard>

          {/* Review / Validation Summary */}
          <SectionCard
            title="Review Summary"
            action={lastRunCases ? { label: "Open Review →", to: "/app/review" } : undefined}
          >
            <div style={{ padding: "16px 18px" }}>
              {!hasData || !lastRunCases ? (
                <EmptyState icon={ClipboardCheck} title="No review data" description="Generate test cases and open the Review page to track approval status." />
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
                    {[
                      { label: "Approved", value: reviewApproved, color: "#10b981", icon: CheckCircle2 },
                      { label: "Pending",  value: reviewPending,  color: "#4A587A",  icon: Clock        },
                      { label: "Rejected", value: reviewRejected, color: "#f87171",  icon: AlertTriangle },
                    ].map(item => (
                      <div key={item.label} style={{ background: item.color + "0C", border: `1px solid ${item.color}22`, borderRadius: 9, padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                          <item.icon size={11} color={item.color} strokeWidth={2} />
                          <span style={{ fontSize: "0.6rem", color: item.color, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
                            {item.label}
                          </span>
                        </div>
                        <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--c-text)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  {reviewTotal > 0 && (
                    <ProgressRow label="Approval progress" value={reviewApproved} max={reviewTotal} color="#10b981" />
                  )}
                </>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── Activity Tables ───────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: col2, gap: 12 }}>

          {/* Recent Runs */}
          <SectionCard title="Recent Runs" action={{ label: "View all", to: "/app/runs" }}>
            {loading && (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <Loader2 size={16} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
              </div>
            )}
            {!loading && runs.length === 0 && (
              <EmptyState icon={GitBranch} title="No runs yet" description="Start a generation run to see history." action={{ label: "Generate Tests", to: "/app/generate" }} />
            )}
            {!loading && runs.length > 0 && (
              <div>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px", padding: "7px 18px", borderBottom: "1px solid var(--c-border)", gap: 8 }}>
                  {["Run", "Status", "Date"].map(h => (
                    <span key={h} style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                      {h}
                    </span>
                  ))}
                </div>
                {runs.slice(0, 6).map((run, i) => {
                  const cfg = STATUS_CONFIG[run.status] ?? { color: "#4A587A", label: run.status };
                  return (
                    <motion.div
                      key={run.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px", padding: "9px 18px", borderBottom: i < runs.length - 1 ? "1px solid var(--c-border)" : "none", gap: 8, alignItems: "center", transition: "background 0.12s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--c-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {run.test_case_count} test cases
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--c-text-3)", marginTop: 2 }}>
                          {run.requirement_count} requirements
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                        <span style={{ fontSize: "0.75rem", color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
                      </div>
                      <span style={{ fontSize: "0.7rem", color: "var(--c-text-3)" }}>{formatDate(run.created_at)}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Top Projects */}
          <SectionCard title="Projects" action={{ label: "View all", to: "/app/projects" }}>
            {projects.length === 0 ? (
              <EmptyState icon={FolderOpen} title="No projects" description="Create a project to organize your runs." action={{ label: "Create Project", onClick: () => setShowNewProject(true) }} />
            ) : (
              <div>
                {/* Table header */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 48px 64px", padding: "7px 18px", borderBottom: "1px solid var(--c-border)", gap: 8 }}>
                  {["Project", "Runs", "Test Cases"].map(h => (
                    <span key={h} style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                      {h}
                    </span>
                  ))}
                </div>
                {projects.slice(0, 6).map((project, i) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    style={{ display: "grid", gridTemplateColumns: "1fr 48px 64px", padding: "9px 18px", borderBottom: i < Math.min(projects.length, 6) - 1 ? "1px solid var(--c-border)" : "none", gap: 8, alignItems: "center", transition: "background 0.12s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: project.id === selectedProject?.id ? "var(--c-accent)" : "#4A587A", flexShrink: 0 }} />
                      <span style={{ fontSize: "0.8rem", fontWeight: project.id === selectedProject?.id ? 600 : 500, color: project.id === selectedProject?.id ? "var(--c-text)" : "var(--c-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {project.name}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "var(--c-text-3)", fontFamily: "var(--font-mono)" }}>
                      {project.id === selectedProject?.id && stats ? stats.total_runs : "—"}
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "var(--c-text-3)", fontFamily: "var(--font-mono)" }}>
                      {project.id === selectedProject?.id && stats ? stats.total_test_cases.toLocaleString() : "—"}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <AnimatePresence>
        {showNewProject && (
          <NewProjectModal
            onClose={() => setShowNewProject(false)}
            onCreated={handleProjectCreated}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}

