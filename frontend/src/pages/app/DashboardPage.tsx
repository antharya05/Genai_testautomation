import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  GitBranch,
  Loader2,
  PlayCircle,
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

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch { return "—"; }
}

function formatDuration(start: string, end?: string): string {
  try {
    const ms = new Date(end ?? new Date().toISOString()).getTime() - new Date(start).getTime();
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60_000)}m`;
  } catch { return "—"; }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

const STATUS_COLORS: Record<string, string> = {
  complete: "#10b981",
  running: "#f59e0b",
  error: "#f87171",
};

const TYPE_COLORS: Record<string, string> = {
  functional: "#818cf8",
  boundary: "#34d399",
  negative: "#f87171",
  fault_injection: "#fb923c",
  timing: "#60a5fa",
  safety: "#a78bfa",
  recovery: "#4ade80",
  stress: "#f472b6",
};

const ASIL_COLORS: Record<string, string> = {
  QM: "#94a3b8", A: "#10b981", B: "#f59e0b", C: "#f97316", D: "#ef4444",
};

function CoverageStrip({ run }: { run: Run }) {
  const counts: [string, number][] = [
    ["functional", run.functional_count ?? 0],
    ["boundary", run.boundary_count ?? 0],
    ["negative", run.negative_count ?? 0],
    ["fault_injection", run.fault_injection_count ?? 0],
    ["timing", run.timing_count ?? 0],
    ["safety", run.safety_count ?? 0],
    ["recovery", run.recovery_count ?? 0],
  ].filter(([, n]) => (n as number) > 0) as [string, number][];

  const total = counts.reduce((s, [, n]) => s + n, 0);
  if (total === 0) return null;

  return (
    <div style={{ display: "flex", height: 4, borderRadius: 3, overflow: "hidden", gap: "1px", marginTop: 5 }}>
      {counts.map(([type, count]) => (
        <div
          key={type}
          title={`${type.replace(/_/g, " ")}: ${count}`}
          style={{ flex: count, background: TYPE_COLORS[type] ?? "#818cf8", minWidth: 3 }}
        />
      ))}
    </div>
  );
}

function AsilDots({ testCases }: { testCases: TestCase[] }) {
  const counts: Record<string, number> = {};
  testCases.forEach(tc => { counts[tc.asil] = (counts[tc.asil] ?? 0) + 1; });
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
    .sort((a, b) => ["QM", "A", "B", "C", "D"].indexOf(b[0]) - ["QM", "A", "B", "C", "D"].indexOf(a[0]));
  if (entries.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {entries.map(([asil, count]) => (
        <span key={asil} style={{
          fontSize: "0.6rem", fontWeight: 700, padding: "1px 5px", borderRadius: 4,
          background: (ASIL_COLORS[asil] ?? "#94a3b8") + "18",
          color: ASIL_COLORS[asil] ?? "#94a3b8",
          border: `1px solid ${(ASIL_COLORS[asil] ?? "#94a3b8")}30`,
          letterSpacing: "0.02em",
        }}>
          {asil}-{count}
        </span>
      ))}
    </div>
  );
}

// ─── New Project Modal ────────────────────────────────────────────────────────

function NewProjectModal({
  onClose,
  onCreated,
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          zIndex: 200, backdropFilter: "blur(4px)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -12 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201, width: "100%", maxWidth: 440,
          padding: "0 20px",
        }}
      >
        <div style={{
          background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
          borderRadius: 16, overflow: "hidden",
          boxShadow: "0 24px 72px rgba(0,0,0,0.4)",
        }}>
          <div style={{
            padding: "16px 20px", borderBottom: "1px solid var(--c-border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <FolderOpen size={15} color="var(--c-accent)" strokeWidth={1.75} />
              </div>
              <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--c-text)" }}>
                New Project
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--c-text-3)", display: "flex", padding: 4, borderRadius: 6,
              }}
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleCreate} style={{ padding: "20px" }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--c-text-2)", marginBottom: 6 }}>
                Project Name <span style={{ color: "var(--c-accent)" }}>*</span>
              </label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError(""); }}
                placeholder="e.g. AEB Safety Validation"
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 9, boxSizing: "border-box",
                  background: "var(--c-bg)", border: "1px solid var(--c-border)",
                  color: "var(--c-text)", fontSize: "0.875rem", outline: "none",
                  fontFamily: "var(--font)", transition: "border-color 0.15s",
                }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-accent)"; }}
                onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border)"; }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--c-text-2)", marginBottom: 6 }}>
                Description <span style={{ color: "var(--c-text-3)", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of this project's scope and objectives"
                rows={3}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 9, boxSizing: "border-box",
                  background: "var(--c-bg)", border: "1px solid var(--c-border)",
                  color: "var(--c-text)", fontSize: "0.875rem", outline: "none",
                  fontFamily: "var(--font)", resize: "vertical", minHeight: 72,
                  transition: "border-color 0.15s",
                }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-accent)"; }}
                onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border)"; }}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: "8px 12px", borderRadius: 8, marginBottom: 14,
                  background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)",
                  fontSize: "0.8125rem", color: "#fca5a5",
                }}
              >
                {error}
              </motion.div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                  background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                  color: "var(--c-text-2)", fontSize: "0.875rem", fontWeight: 500,
                  fontFamily: "var(--font)",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                style={{
                  padding: "8px 18px", borderRadius: 8,
                  cursor: saving || !name.trim() ? "not-allowed" : "pointer",
                  background: saving || !name.trim() ? "var(--c-bg-2)" : "var(--c-accent)",
                  border: `1px solid ${saving || !name.trim() ? "var(--c-border)" : "var(--c-accent)"}`,
                  color: saving || !name.trim() ? "var(--c-text-3)" : "white",
                  fontSize: "0.875rem", fontWeight: 600, fontFamily: "var(--font)",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.15s",
                }}
              >
                {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
                {saving ? "Creating…" : "Create Project"}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  icon: "sparkles" | "check" | "folder" | "error";
  label: string;
  time: string;
}

function buildActivityFeed(runs: Run[], projects: Project[]): ActivityItem[] {
  const items: ActivityItem[] = [];

  runs.slice(0, 5).forEach(run => {
    if (run.status === "complete") {
      items.push({
        id: `run-${run.id}`,
        icon: "sparkles",
        label: `Generated ${run.test_case_count} test cases from ${run.requirement_count} requirements`,
        time: formatRelative(run.created_at),
      });
    } else if (run.status === "error") {
      items.push({
        id: `run-err-${run.id}`,
        icon: "error",
        label: `Generation failed (${run.requirement_count} requirements)`,
        time: formatRelative(run.created_at),
      });
    }
  });

  projects.slice(0, 3).forEach(p => {
    items.push({
      id: `proj-${p.id}`,
      icon: "folder",
      label: `Project "${p.name}" created`,
      time: formatRelative(p.created_at),
    });
  });

  items.sort((a, b) => {
    const timeScore = (t: string) => {
      if (t === "just now") return 0;
      const m = t.match(/^(\d+)(m|h|d)/);
      if (!m) return 99999;
      const n = parseInt(m[1]);
      if (m[2] === "m") return n;
      if (m[2] === "h") return n * 60;
      return n * 1440;
    };
    return timeScore(a.time) - timeScore(b.time);
  });

  return items.slice(0, 6);
}

const ACTIVITY_ICONS: Record<ActivityItem["icon"], { icon: typeof Sparkles; color: string }> = {
  sparkles: { icon: Sparkles, color: "#818cf8" },
  check:    { icon: CheckCircle2, color: "#10b981" },
  folder:   { icon: FolderOpen, color: "#60a5fa" },
  error:    { icon: AlertTriangle, color: "#f87171" },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { projects: contextProjects, selectedProject, refreshProjects } = useProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [coverageData, setCoverageData] = useState<[string, number][] | null>(null);
  const [lastRunTotalCases, setLastRunTotalCases] = useState(0);
  const [runCasesMap, setRunCasesMap] = useState<Record<string, TestCase[]>>({});
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Mirror context projects so we can append locally created ones
  useEffect(() => { setProjects(contextProjects); }, [contextProjects]);

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
          const counts: Record<string, number> = {};
          tcs.forEach(tc => { counts[tc.test_type] = (counts[tc.test_type] ?? 0) + 1; });
          setCoverageData(Object.entries(counts).sort((a, b) => b[1] - a[1]));
          setLastRunTotalCases(tcs.length);
          setRunCasesMap(prev => ({ ...prev, [lastCompleted.id]: tcs }));
        } catch { /* no coverage */ }
      }
    } catch { /* backend offline */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStats(null);
    setRuns([]);
    setCoverageData(null);
    setRunCasesMap({});
    loadAll().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [selectedProject]);

  async function handleProjectCreated(p: Project) {
    setShowNewProject(false);
    await refreshProjects();
  }

  // Derived validation/risk data from runs
  const completedRuns = runs.filter(r => r.status === "complete");
  const totalCasesAcrossRuns = completedRuns.reduce((s, r) => s + r.test_case_count, 0);
  const safetyCount = completedRuns.reduce((s, r) => s + (r.safety_count ?? 0) + (r.fault_injection_count ?? 0), 0);
  const highRiskCount = safetyCount;
  const mediumRiskCount = completedRuns.reduce((s, r) => s + (r.negative_count ?? 0) + (r.boundary_count ?? 0), 0);
  const lowRiskCount = completedRuns.reduce((s, r) => s + (r.functional_count ?? 0) + (r.timing_count ?? 0) + (r.recovery_count ?? 0), 0);
  const activityFeed = buildActivityFeed(runs, projects);

  // Review stats from the most recent completed run's test cases
  const lastRunCases = completedRuns.length > 0 ? (runCasesMap[completedRuns[0].id] ?? null) : null;
  const reviewApproved = lastRunCases ? lastRunCases.filter(tc => tc.review_status === "approved").length : 0;
  const reviewPending = lastRunCases ? lastRunCases.filter(tc => !tc.review_status || tc.review_status === "pending").length : 0;
  const reviewRejected = lastRunCases ? lastRunCases.filter(tc => tc.review_status === "rejected").length : 0;

  return (
    <PageTransition>
      <div style={{ padding: "28px 32px 48px", maxWidth: 1200 }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>
              Dashboard
            </h1>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: "3px 0 0" }}>
              Activity overview for your workspace
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowNewProject(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                color: "var(--c-text-2)", cursor: "pointer",
                fontSize: "0.8125rem", fontWeight: 600, fontFamily: "var(--font)",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--c-border-2)"; el.style.color = "var(--c-text)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--c-border)"; el.style.color = "var(--c-text-2)"; }}
            >
              <Plus size={13} />
              New Project
            </button>
            <Link
              to="/app/generate"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8,
                background: "var(--c-accent)", color: "white",
                textDecoration: "none", fontSize: "0.8125rem", fontWeight: 600,
                boxShadow: "0 0 14px rgba(99,102,241,0.3)",
              }}
            >
              <Sparkles size={13} />
              New Run
            </Link>
          </div>
        </div>

        {/* ── KPI strip ────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
          {[
            { label: "Total Runs", value: stats?.total_runs, icon: GitBranch, color: "#60a5fa" },
            { label: "Completed", value: stats?.completed_runs, icon: CheckCircle2, color: "#10b981" },
            { label: "Test Cases", value: stats?.total_test_cases, icon: Sparkles, color: "#818cf8" },
            { label: "Requirements", value: stats?.total_requirements, icon: FileText, color: "#34d399" },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                background: "var(--c-surface)", border: "1px solid var(--c-border)",
                borderRadius: 12, padding: "14px 18px",
                display: "flex", alignItems: "center", gap: 12,
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: item.color + "15",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <item.icon size={15} color={item.color} strokeWidth={1.75} />
              </div>
              <div>
                <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--c-text)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                  {loading
                    ? <Loader2 size={14} color="var(--c-text-3)" style={{ animation: "spin 1s linear infinite" }} />
                    : (item.value ?? 0).toLocaleString()
                  }
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 3, fontWeight: 500 }}>
                  {item.label}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Project cards ─────────────────────────────────────── */}
        {!loading && projects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "var(--c-surface)", border: "1px dashed var(--c-border)",
              borderRadius: 14, padding: "28px 24px", marginBottom: 14,
              textAlign: "center",
            }}
          >
            <FolderOpen size={22} color="var(--c-text-3)" style={{ marginBottom: 10 }} />
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: "0 0 14px" }}>
              No projects yet. Create one to get started.
            </p>
            <button
              onClick={() => setShowNewProject(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 7,
                background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)",
                color: "var(--c-accent)", cursor: "pointer",
                fontSize: "0.8125rem", fontWeight: 600, fontFamily: "var(--font)",
              }}
            >
              <Plus size={13} />
              Create Project
            </button>
          </motion.div>
        )}

        {!loading && projects.length > 0 && (
          <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {projects.slice(0, 3).map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                style={{
                  background: "var(--c-surface)", border: "1px solid var(--c-border)",
                  borderRadius: 14, padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: 14,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FolderOpen size={16} color="var(--c-accent)" strokeWidth={1.75} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {project.name}
                    </span>
                    {i === 0 && (
                      <span style={{
                        fontSize: "0.6rem", fontWeight: 700, padding: "1px 5px", borderRadius: 4, flexShrink: 0,
                        background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
                        color: "#10b981", letterSpacing: "0.04em",
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--c-text-3)", marginTop: 2 }}>
                    {i === 0 && stats
                      ? `${stats.total_runs} run${stats.total_runs !== 1 ? "s" : ""} · ${stats.total_test_cases.toLocaleString()} test cases`
                      : project.description || "No runs yet"
                    }
                  </div>
                </div>
                {i === 0 && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Link
                      to="/app/generate"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 10px", borderRadius: 7, fontSize: "0.75rem", fontWeight: 600,
                        background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)",
                        color: "var(--c-accent)", textDecoration: "none",
                      }}
                    >
                      <Sparkles size={11} />
                      New Run
                    </Link>
                    <Link
                      to="/app/runs"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 10px", borderRadius: 7, fontSize: "0.75rem", fontWeight: 500,
                        background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                        color: "var(--c-text-2)", textDecoration: "none",
                      }}
                    >
                      History
                    </Link>
                  </div>
                )}
              </motion.div>
            ))}
            {projects.length > 3 && (
              <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", padding: "4px 8px" }}>
                +{projects.length - 3} more project{projects.length - 3 !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}

        {/* ── Main grid ────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 264px", gap: 14 }}>

          {/* Recent runs */}
          <div>
            <div style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 14, overflow: "hidden", marginBottom: 14,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 20px", borderBottom: "1px solid var(--c-border)",
              }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", margin: 0 }}>
                  Recent Runs
                </h3>
                <Link to="/app/runs" style={{ color: "var(--c-accent)", fontSize: "0.8125rem", fontWeight: 500, textDecoration: "none" }}>
                  View all
                </Link>
              </div>

              {loading && (
                <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                  <Loader2 size={18} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
                </div>
              )}

              {!loading && runs.length === 0 && (
                <div style={{ padding: "40px 24px", textAlign: "center" }}>
                  <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: "0 0 14px" }}>
                    No runs yet.
                  </p>
                  <Link to="/app/generate" style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 7, background: "var(--c-accent-dim)",
                    border: "1px solid var(--c-accent-glow)", color: "var(--c-accent)",
                    textDecoration: "none", fontSize: "0.8125rem", fontWeight: 600,
                  }}>
                    <Sparkles size={13} />
                    Start generating
                  </Link>
                </div>
              )}

              {!loading && runs.map((run, i) => (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  style={{
                    padding: "11px 20px",
                    borderBottom: i < runs.length - 1 ? "1px solid var(--c-border)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: (STATUS_COLORS[run.status] ?? "#94a3b8") + "15",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginTop: 1,
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: STATUS_COLORS[run.status] ?? "#94a3b8",
                      }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>
                          {run.test_case_count} test cases
                        </span>
                        <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                          from {run.requirement_count} reqs
                        </span>
                        {run.completed_at && (
                          <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                            · {formatDuration(run.created_at, run.completed_at)}
                          </span>
                        )}
                        {run.status === "error" && (
                          <span style={{ fontSize: "0.6875rem", color: "#f87171" }}>failed</span>
                        )}
                      </div>

                      {run.status === "complete" && <CoverageStrip run={run} />}

                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: run.status === "complete" ? 5 : 0 }}>
                        {runCasesMap[run.id] && <AsilDots testCases={runCasesMap[run.id]} />}
                        <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginLeft: runCasesMap[run.id] ? "auto" : 0 }}>
                          {formatRelative(run.created_at)}
                        </span>
                      </div>

                      {!runCasesMap[run.id] && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                          <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                            {formatRelative(run.created_at)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                      <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", whiteSpace: "nowrap" }}>
                        {formatDate(run.created_at)}
                      </span>
                      {run.status === "complete" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <Link
                            to={`/app/test-cases?runId=${run.id}`}
                            style={{
                              fontSize: "0.6875rem", color: "var(--c-accent)", fontWeight: 600,
                              textDecoration: "none", padding: "2px 8px", borderRadius: 4,
                              background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Cases
                          </Link>
                          <Link
                            to={`/app/traceability?runId=${run.id}`}
                            style={{
                              fontSize: "0.6875rem", color: "#60a5fa", fontWeight: 600,
                              textDecoration: "none", padding: "2px 8px", borderRadius: 4,
                              background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Trace
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Review Summary */}
            <div style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 14, padding: "16px 18px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>
                  Review Summary
                </div>
                {lastRunCases && (
                  <Link to="/app/review" style={{ fontSize: "0.75rem", color: "var(--c-accent)", fontWeight: 500, textDecoration: "none" }}>
                    Open Review →
                  </Link>
                )}
              </div>
              {!lastRunCases ? (
                <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0, lineHeight: 1.6 }}>
                  Run a generation to see review status.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[
                    { label: "Approved", value: reviewApproved, color: "#10b981", icon: CheckCircle2 },
                    { label: "Pending", value: reviewPending, color: "#94a3b8", icon: Clock },
                    { label: "Rejected", value: reviewRejected, color: "#f87171", icon: AlertTriangle },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: item.color + "0C", border: `1px solid ${item.color}22`,
                      borderRadius: 10, padding: "10px 12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                        <item.icon size={11} color={item.color} strokeWidth={2} />
                        <span style={{ fontSize: "0.625rem", color: item.color, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {item.label}
                        </span>
                      </div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--c-text)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Coverage distribution */}
            <div style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 14, padding: "16px 18px",
            }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 12 }}>
                Coverage Distribution
              </div>
              {loading && (
                <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                  <Loader2 size={14} color="var(--c-text-3)" style={{ animation: "spin 1s linear infinite" }} />
                </div>
              )}
              {!loading && !coverageData && (
                <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0, lineHeight: 1.6 }}>
                  Run a generation to see coverage breakdown.
                </p>
              )}
              {coverageData && (() => {
                const max = coverageData[0][1];
                return (
                  <>
                    {coverageData.map(([type, count], i) => (
                      <div key={type} style={{ marginBottom: i < coverageData.length - 1 ? 8 : 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--c-text-2)", fontWeight: 500, textTransform: "capitalize" }}>
                            {type.replace(/_/g, " ")}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", fontFamily: "var(--font-mono)" }}>
                            {count}
                          </span>
                        </div>
                        <div style={{ height: 4, background: "var(--c-border)", borderRadius: 3 }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(count / max) * 100}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                            style={{ height: "100%", borderRadius: 3, background: TYPE_COLORS[type] ?? "#818cf8" }}
                          />
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--c-border)" }}>
                      <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                        {lastRunTotalCases} cases · last run
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Risk Analysis */}
            <div style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 14, padding: "16px 18px",
            }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 12 }}>
                Risk Analysis
              </div>
              {totalCasesAcrossRuns === 0 ? (
                <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0, lineHeight: 1.6 }}>
                  Risk breakdown appears after a completed run.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {[
                    { label: "High Risk", value: highRiskCount, color: "#f87171", note: "safety + fault injection" },
                    { label: "Medium Risk", value: mediumRiskCount, color: "#f59e0b", note: "negative + boundary" },
                    { label: "Low Risk", value: lowRiskCount, color: "#10b981", note: "functional + timing" },
                  ].map(item => {
                    const total = highRiskCount + mediumRiskCount + lowRiskCount || 1;
                    return (
                      <div key={item.label}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--c-text-2)", fontWeight: 500 }}>{item.label}</span>
                          <span style={{ fontSize: "0.75rem", color: item.color, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                            {item.value}
                          </span>
                        </div>
                        <div style={{ height: 4, background: "var(--c-border)", borderRadius: 3 }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.value / total) * 100}%` }}
                            transition={{ duration: 0.5 }}
                            style={{ height: "100%", borderRadius: 3, background: item.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 14, padding: "16px 18px",
            }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 12 }}>
                Recent Activity
              </div>
              {activityFeed.length === 0 ? (
                <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0, lineHeight: 1.6 }}>
                  Activity will appear after your first run.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activityFeed.map((item, i) => {
                    const def = ACTIVITY_ICONS[item.icon];
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1,
                          background: def.color + "15",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <def.icon size={11} color={def.color} strokeWidth={2} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.75rem", color: "var(--c-text-2)", lineHeight: 1.4 }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 2 }}>
                            {item.time}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 14, padding: "16px 18px",
            }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 10 }}>
                Quick Actions
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {[
                  { to: "/app/generate", label: "New Generation Run", icon: Sparkles, color: "var(--c-accent)" },
                  { to: "/app/test-cases", label: "Review Test Cases", icon: Activity, color: "#818cf8" },
                  { to: "/app/traceability", label: "Traceability Matrix", icon: GitBranch, color: "#60a5fa" },
                  { to: "/app/runs", label: "Run History", icon: PlayCircle, color: "#f59e0b" },
                ].map(item => (
                  <Link
                    key={item.to}
                    to={item.to}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", borderRadius: 8,
                      background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                      textDecoration: "none", color: "var(--c-text-2)",
                      fontSize: "0.8125rem", fontWeight: 500,
                      transition: "all 0.12s ease",
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "var(--c-border-2)";
                      el.style.color = "var(--c-text)";
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "var(--c-border)";
                      el.style.color = "var(--c-text-2)";
                    }}
                  >
                    <item.icon size={14} color={item.color} strokeWidth={1.75} />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
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
