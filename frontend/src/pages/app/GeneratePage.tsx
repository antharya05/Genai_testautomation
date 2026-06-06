/**
 * GeneratePage — the routed generate workflow inside AppShell.
 *
 * Phase → Approved workflow stage mapping:
 *   "upload"     → Upload     (UploadBox + DemoLoader)
 *   "review"     → Analysis   (RequirementsPanel — requirement selection before generation)
 *   "generating" → Generate   (GeneratingScreen — SSE progress stream)
 *   "results"    → Review + Export (TestCaseTable + TraceabilityPanel + ExportModal)
 *
 * NOTE: The phase named "review" here is requirement pre-selection (Analysis in the
 * approved spec). The approved workflow's "Review" stage (approve/flag/reject) is
 * the "results" phase below. These will be renamed when Sprint 2 adds formal review
 * states to the test case model.
 *
 * Layout ownership:
 *   AppShell owns: sidebar, topbar, margin offsets, theme, scroll container.
 *   This component owns: phase state, generation logic, SSE connection, test case state.
 *   Do NOT re-introduce: Sidebar, Header, darkMode, sidebarWidth, height:100vh wrappers.
 *
 * Project support:
 *   projectId is a structural placeholder — null until Projects are implemented.
 *   All run-producing actions (handleGenerate, handleReset) accept it so they are
 *   ready to pass a project scope when the Projects feature is wired in Sprint 2.
 */

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, FileText, FolderOpen, GitBranch, Sparkles } from "lucide-react";
import { type ElementType, useCallback, useEffect, useRef, useState } from "react";
import { getProjectRuns, getProjectStats, listProjects, openJobStream, startGeneration } from "../../api/client";
import type { Project, ProjectStats, Run } from "../../types";
import { GeneratingScreen } from "../../components/GeneratingScreen";
import { ExportModal } from "../../components/export/ExportModal";
import { RequirementsPanel } from "../../components/RequirementsPanel";
import { TestCaseTable } from "../../components/review/TestCaseTable";
import { TraceabilityPanel } from "../../components/review/TraceabilityPanel";
import { ToastContainer } from "../../components/ui/Toast";
import { DemoLoader } from "../../components/upload/DemoLoader";
import { UploadBox } from "../../components/upload/UploadBox";
import { useToast } from "../../hooks/useToast";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import type { TestCase, UploadResult } from "../../types";

// ─── Types ────────────────────────────────────────────────────────────────────

// Phase "review" = pre-generation requirements selection (Analysis in the approved spec).
// Phase "results" = post-generation test case review (Review + Export in the approved spec).
type Phase = "upload" | "review" | "generating" | "results";

// ─── Provider / model catalogue ───────────────────────────────────────────────

const PROVIDER_MODELS: Record<string, string[]> = {
  "Anthropic":  ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
  "OpenAI":     ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  "Gemini":     ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  "Groq":       ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  "OpenRouter": ["anthropic/claude-3.5-sonnet", "openai/gpt-4o", "google/gemini-pro-1.5"],
  "Ollama":     ["llama3.2", "mistral", "codellama"],
};

const DEFAULT_PROVIDER = "Anthropic";
const DEFAULT_MODEL    = "claude-sonnet-4-6";

// ─── Sidebar stat row ─────────────────────────────────────────────────────────

function SidebarStat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon size={12} color={highlight ? "var(--c-accent)" : "var(--c-text-3)"} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", flex: 1 }}>{label}</span>
      <span style={{
        fontSize: "0.75rem", fontWeight: 600,
        color: highlight ? "var(--c-accent)" : "var(--c-text-2)",
        fontFamily: highlight ? undefined : "var(--font-mono)",
      }}>
        {value}
      </span>
    </div>
  );
}

// ─── Type/coverage colors ─────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  functional: "#818cf8",
  boundary: "#34d399",
  negative: "#f87171",
  fault_injection: "#fb923c",
  timing: "#60a5fa",
  safety: "#a78bfa",
  recovery: "#4ade80",
};

function LastRunPanel({ run }: { run: Run }) {
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

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch { return ""; }
  }

  return (
    <div style={{
      background: "var(--c-surface)", border: "1px solid var(--c-border)",
      borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>
        Last Run
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--c-text)", letterSpacing: "-0.03em", lineHeight: 1 }}>
          {run.test_case_count}
        </span>
        <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>cases</span>
        <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginLeft: "auto" }}>
          {formatDate(run.created_at)}
        </span>
      </div>

      {/* Coverage strip */}
      {total > 0 && (
        <>
          <div style={{ height: 5, borderRadius: 3, overflow: "hidden", display: "flex", gap: "1px", marginBottom: 8 }}>
            {counts.map(([type, count]) => (
              <div
                key={type}
                title={`${type.replace(/_/g, " ")}: ${count}`}
                style={{ flex: count, background: TYPE_COLORS[type] ?? "#818cf8", minWidth: 3 }}
              />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {counts.slice(0, 4).map(([type, count]) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: TYPE_COLORS[type] ?? "#818cf8",
                }} />
                <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", flex: 1, textTransform: "capitalize" }}>
                  {type.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: "0.6875rem", color: "var(--c-text-2)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {count}
                </span>
              </div>
            ))}
            {counts.length > 4 && (
              <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                +{counts.length - 4} more types
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const PROJECT_COLORS = ["#6366f1", "#818cf8", "#34d399", "#f59e0b", "#60a5fa", "#f472b6", "#a78bfa"];

// ─── Project selector ─────────────────────────────────────────────────────────

function ProjectSelector({
  projects,
  selected,
  onSelect,
}: {
  projects: Project[];
  selected: Project | null;
  onSelect: (p: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const color = selected ? PROJECT_COLORS[projects.indexOf(selected) % PROJECT_COLORS.length] : "#6366f1";

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 520 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 9,
          padding: "10px 14px", borderRadius: 10, cursor: "pointer",
          background: "var(--c-surface)", border: "1px solid var(--c-border)",
          fontFamily: "var(--font)", transition: "border-color 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border-2)"; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border)"; }}
      >
        <FolderOpen size={14} color={color} strokeWidth={1.75} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", flex: 1, textAlign: "left" }}>
          {selected?.name ?? "Select Project"}
        </span>
        <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginRight: 4 }}>Project</span>
        <ChevronDown
          size={14}
          color="var(--c-text-3)"
          style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}
        />
      </button>

      <AnimatePresence>
        {open && projects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 10, zIndex: 50, overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            }}
          >
            {projects.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 9,
                  padding: "9px 14px", border: "none", cursor: "pointer",
                  background: p.id === selected?.id ? "var(--c-accent-dim)" : "transparent",
                  fontFamily: "var(--font)", transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (p.id !== selected?.id) (e.currentTarget as HTMLElement).style.background = "var(--c-bg-2)"; }}
                onMouseLeave={e => { if (p.id !== selected?.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: PROJECT_COLORS[i % PROJECT_COLORS.length], flexShrink: 0 }} />
                <span style={{
                  fontSize: "0.875rem", fontWeight: 500,
                  color: p.id === selected?.id ? "var(--c-accent)" : "var(--c-text-2)",
                  flex: 1, textAlign: "left",
                }}>
                  {p.name}
                </span>
                {p.id === selected?.id && <CheckCircle2 size={13} color="var(--c-accent)" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Project context card ─────────────────────────────────────────────────────

function ProjectContextCard({
  projectName,
  stats,
  projectColor,
}: {
  projectName: string;
  stats: ProjectStats | null;
  projectColor: string;
}) {
  return (
    <div style={{
      width: "100%", maxWidth: 520,
      background: "var(--c-surface)", border: "1px solid var(--c-border)",
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: projectColor + "15", border: `1px solid ${projectColor}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <FolderOpen size={15} color={projectColor} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>{projectName}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 1 }}>
            {stats
              ? `${stats.total_runs} run${stats.total_runs !== 1 ? "s" : ""} · ${stats.total_test_cases.toLocaleString()} test cases · ${stats.total_requirements.toLocaleString()} requirements`
              : "Loading…"
            }
          </div>
        </div>
        {stats && (
          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
            {[
              { icon: GitBranch, value: stats.total_runs, color: "#60a5fa", label: "runs" },
              { icon: Sparkles, value: stats.total_test_cases, color: "#818cf8", label: "cases" },
            ].map(item => (
              <div key={item.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--c-text)", lineHeight: 1 }}>
                  {item.value.toLocaleString()}
                </div>
                <div style={{ fontSize: "0.625rem", color: "var(--c-text-3)", marginTop: 2, letterSpacing: "0.02em" }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  // ── Provider / model selection ──────────────────────────────────────────────
  const [selectedProvider, setSelectedProvider] = useState(DEFAULT_PROVIDER);
  const [selectedModel, setSelectedModel]       = useState(DEFAULT_MODEL);

  function handleProviderChange(provider: string) {
    setSelectedProvider(provider);
    setSelectedModel(PROVIDER_MODELS[provider]?.[0] ?? "");
  }

  // ── Project context ─────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const projectId = selectedProject?.id ?? "00000000-0000-0000-0000-000000000001";
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [lastRun, setLastRun] = useState<Run | null>(null);

  useEffect(() => {
    listProjects()
      .then(list => {
        setProjects(list);
        if (list.length > 0) setSelectedProject(list[0]);
      })
      .catch(() => {});
  }, []);

  const loadProjectData = useCallback(() => {
    getProjectStats(projectId).then(setProjectStats).catch(() => {});
    getProjectRuns(projectId, 5)
      .then(runs => {
        const last = runs.find(r => r.status === "complete");
        if (last) setLastRun(last);
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => { loadProjectData(); }, [loadProjectData]);

  // ── Phase and upload state ──────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("upload");
  const [uploadData, setUploadData] = useState<UploadResult | null>(null);

  // ── Generation progress state (drives GeneratingScreen + SSE updates) ───────
  const [genProgress, setGenProgress] = useState({
    current: 0,
    total: 0,
    casesFound: 0,
    currentReq: "",
    ragActive: false,
    genPhase: "queued" as "queued" | "generating" | "validating" | "done",
  });

  // ── Export modal visibility ─────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);

  // ── SSE EventSource ref — closed on unmount and route changes ───────────────
  const esRef = useRef<EventSource | null>(null);

  // ── Test case state with undo/redo history ──────────────────────────────────
  const {
    state: testCases,
    set: setTestCases,
    undo,
    redo,
    reset: resetCases,
    canUndo,
    canRedo,
  } = useUndoRedo<TestCase[]>([]);

  // ── Toast notifications ─────────────────────────────────────────────────────
  const { toasts, push: pushToast, dismiss } = useToast();

  // Close SSE on unmount (handles tab close, navigation away from /app/generate)
  useEffect(() => () => { esRef.current?.close(); }, []);

  // ─── Event handlers ─────────────────────────────────────────────────────────

  function handleUploadSuccess(data: UploadResult) {
    setUploadData(data);
    setPhase("review");
    pushToast(
      "success",
      `Extracted ${data.requirement_count} requirements from "${data.filename}"`
    );
  }

  function handleUploadError(msg: string) {
    pushToast("error", msg);
  }

  async function handleGenerate(requirements: string[]) {
    setPhase("generating");
    setGenProgress({
      current: 0,
      total: requirements.length,
      casesFound: 0,
      currentReq: "",
      ragActive: true,
      genPhase: "queued",
    });

    try {
      const { job_id } = await startGeneration(requirements, projectId, selectedProvider, selectedModel);
      const es = openJobStream(job_id);
      esRef.current = es;

      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const current = data.current ?? 0;
        const total = data.total ?? requirements.length;
        const cases: TestCase[] = data.test_cases ?? [];

        let genPhase: typeof genProgress.genPhase = "generating";
        if (data.type === "complete") genPhase = "done";
        else if (current === 0) genPhase = "queued";
        else if (current === total) genPhase = "validating";

        setGenProgress({
          current,
          total,
          casesFound: cases.length,
          currentReq: requirements[Math.max(0, current - 1)] ?? "",
          ragActive: true,
          genPhase,
        });

        if (data.type === "complete") {
          es.close();
          resetCases(cases);
          setPhase("results");
          pushToast("success", `Generated ${cases.length} test cases successfully`);
          loadProjectData();
        }

        if (data.type === "error") {
          es.close();
          pushToast("error", data.message ?? "Generation failed");
          setPhase("review");
        }
      };

      es.onerror = () => {
        es.close();
        pushToast("error", "Connection to backend lost");
        setPhase("review");
      };
    } catch {
      pushToast("error", "Failed to start generation. Is the backend running?");
      setPhase("review");
    }
  }

  function handleEdit(id: string, field: keyof TestCase, value: string) {
    setTestCases((prev) =>
      prev.map((tc) => (tc.test_id === id ? { ...tc, [field]: value } : tc))
    );
  }

  function handleDelete(id: string) {
    setTestCases((prev) => prev.filter((tc) => tc.test_id !== id));
    pushToast("info", "Test case deleted");
  }

  function handleReset() {
    // TODO Sprint 2: if a run was in progress, mark it cancelled in the DB using projectId.
    esRef.current?.close();
    setPhase("upload");
    setUploadData(null);
    resetCases([]);
    setGenProgress({
      current: 0,
      total: 0,
      casesFound: 0,
      currentReq: "",
      ragActive: false,
      genPhase: "queued",
    });
  }

  const progressPct =
    genProgress.total > 0
      ? (genProgress.current / genProgress.total) * 100
      : 0;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence mode="wait">

        {/* ── Upload (approved: Upload stage) ───────────────────────────────── */}
        {phase === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              padding: "40px 40px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              alignItems: "center",
            }}
          >
            <ProjectSelector projects={projects} selected={selectedProject} onSelect={setSelectedProject} />
            <ProjectContextCard
              projectName={selectedProject?.name ?? ""}
              stats={projectStats}
              projectColor={PROJECT_COLORS[projects.indexOf(selectedProject!) % PROJECT_COLORS.length] ?? "#6366f1"}
            />

            <UploadBox
              onSuccess={handleUploadSuccess}
              onError={handleUploadError}
            />

            <div style={{ width: "100%", maxWidth: 520 }}>
              <DemoLoader onLoad={handleUploadSuccess} />
            </div>
          </motion.div>
        )}

        {/* ── Requirements selection (approved: Analysis stage) ──────────────── */}
        {phase === "review" && uploadData && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ padding: "32px 40px 64px", display: "flex", gap: 24, alignItems: "flex-start" }}
          >
            {/* Requirements list — centered within its flex region */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
              <RequirementsPanel
                data={uploadData}
                onGenerate={handleGenerate}
                onBack={handleReset}
              />
            </div>

            {/* Analysis sidebar */}
            <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>

              {/* Source */}
              <div style={{
                background: "var(--c-surface)", border: "1px solid var(--c-border)",
                borderRadius: 12, padding: "14px 16px",
              }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>
                  Source
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <SidebarStat icon={FileText} label="File" value={uploadData.filename.length > 22 ? uploadData.filename.slice(0, 22) + "…" : uploadData.filename} />
                  <SidebarStat icon={CheckCircle2} label="Requirements" value={String(uploadData.requirement_count)} highlight />
                </div>
              </div>

              {/* Generation */}
              <div style={{
                background: "var(--c-surface)", border: "1px solid var(--c-border)",
                borderRadius: 12, padding: "14px 16px",
              }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>
                  Generation
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Provider dropdown */}
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginBottom: 4 }}>Provider</div>
                    <select
                      value={selectedProvider}
                      onChange={e => handleProviderChange(e.target.value)}
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: 7,
                        background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                        color: "var(--c-text)", fontSize: "0.8125rem", fontFamily: "var(--font)",
                        outline: "none", cursor: "pointer", appearance: "auto",
                      }}
                    >
                      {Object.keys(PROVIDER_MODELS).map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  {/* Model dropdown */}
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginBottom: 4 }}>Model</div>
                    <select
                      value={selectedModel}
                      onChange={e => setSelectedModel(e.target.value)}
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: 7,
                        background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                        color: "var(--c-text)", fontSize: "0.8125rem", fontFamily: "var(--font)",
                        outline: "none", cursor: "pointer", appearance: "auto",
                      }}
                    >
                      {(PROVIDER_MODELS[selectedProvider] ?? []).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ paddingTop: 8, borderTop: "1px solid var(--c-border)", marginTop: 2 }}>
                    <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginBottom: 4 }}>
                      Est. output
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--c-accent)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                      ~{Math.round(uploadData.requirement_count * 2.5)}
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 3 }}>
                      test cases (estimate)
                    </div>
                  </div>
                </div>
              </div>

              {/* Project history */}
              {projectStats && projectStats.total_runs > 0 && (
                <div style={{
                  background: "var(--c-surface)", border: "1px solid var(--c-border)",
                  borderRadius: 12, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 10 }}>
                    Project History
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <SidebarStat icon={Sparkles} label="Total runs" value={String(projectStats.total_runs)} />
                    <SidebarStat icon={CheckCircle2} label="Test cases" value={projectStats.total_test_cases.toLocaleString()} />
                  </div>
                </div>
              )}

              {/* Last run summary */}
              {lastRun && <LastRunPanel run={lastRun} />}
            </div>
          </motion.div>
        )}

        {/* ── SSE generation progress (approved: Generate stage) ────────────── */}
        {phase === "generating" && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              // Explicit height lets GeneratingScreen's flex:1 fill the
              // viewport correctly. AppShell's <main> has marginTop:56,
              // so available height is 100vh - 56px.
              minHeight: "calc(100vh - 56px)",
              display: "flex",
            }}
          >
            <GeneratingScreen
              progress={progressPct}
              currentReq={genProgress.currentReq}
              totalReqs={genProgress.total}
              completedReqs={genProgress.current}
              ragActive={genProgress.ragActive}
              phase={genProgress.genPhase}
            />
          </motion.div>
        )}

        {/* ── Test case review (approved: Review + Export stages) ───────────── */}
        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              padding: "24px 40px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
              // Extra bottom padding so the last card clears the viewport
              paddingBottom: 64,
            }}
          >
            {/*
             * TestCaseTable = Milestone 1 review surface.
             * Inline title editing, delete, undo/redo, sort/filter.
             * Sprint 2 adds: approve/flag/reject states, reviewer attribution.
             * TODO Sprint 2: pass projectId and runId for persistence.
             */}
            <TestCaseTable
              testCases={testCases}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              onExport={() => setShowExport(true)}
            />

            {uploadData && uploadData.requirements.length > 0 && (
              <TraceabilityPanel
                requirements={uploadData.requirements}
                testCases={testCases}
              />
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Export modal (Excel + JIRA CSV) — rendered as a portal above AppShell ── */}
      <AnimatePresence>
        {showExport && (
          <ExportModal
            testCases={testCases}
            onClose={() => setShowExport(false)}
            onToast={pushToast}
          />
        )}
      </AnimatePresence>

      {/* ToastContainer: zIndex 300 — above AppSidebar (40) and AppTopBar (30) */}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </>
  );
}
