import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  GitBranch,
  Info,
  Loader2,
  Shield,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProjectRuns, getRunRequirements, getRunTestCases } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { PageTransition } from "../../components/layout/PageTransition";
import type { ASIL, Run, TestCase } from "../../types";

// ─── Constants ────────────────────────────────────────────────────────────────

const ASIL_ORDER = ["D", "C", "B", "A", "QM"];
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

// ─── Requirement analysis helpers ─────────────────────────────────────────────

const AMBIGUOUS_WORDS = [
  "quickly", "fast", "efficiently", "properly", "adequate", "reasonable",
  "timely", "soon", "immediately", "shortly", "optimal", "appropriate",
  "sufficient", "reasonable", "satisfactory", "good", "acceptable",
];

const TIMING_UNITS = ["ms", "millisecond", "second", "hz", "μs", "us", "cycle", "period", "latency", "timeout"];
const NUMERIC = /\d+(\.\d+)?\s*(ms|s|hz|rpm|v|°c|%|a|w|bar|km\/h|m\/s)/i;
const THRESHOLD = /\d+(\.\d+)?\s*(ms|milliseconds?|seconds?|hz|rpm|volts?|°c|celsius|%|amps?|watts?|bar|km\/h)/i;

type ReqFlag = "valid" | "ambiguous" | "missing_timing" | "missing_threshold" | "incomplete";

interface ReqAnalysis {
  id: string;
  text: string;
  flags: ReqFlag[];
  risk: "high" | "medium" | "low";
  asil: string;
  covered: boolean;
}

function analyzeRequirement(
  id: string,
  text: string,
  covered: boolean,
  relatedCases: TestCase[],
): ReqAnalysis {
  const flags: ReqFlag[] = [];
  const lower = text.toLowerCase();

  if (text.length < 25) flags.push("incomplete");

  const hasAmbiguous = AMBIGUOUS_WORDS.some(w => lower.includes(w));
  if (hasAmbiguous) flags.push("ambiguous");

  const mightNeedTiming = ["respond", "detect", "trigger", "activat", "deactivat", "process", "communicat", "transmit", "receive"].some(k => lower.includes(k));
  if (mightNeedTiming && !TIMING_UNITS.some(u => lower.includes(u))) flags.push("missing_timing");

  const mightNeedThreshold = ["voltage", "temperature", "speed", "current", "pressure", "signal", "level", "range", "limit", "threshold"].some(k => lower.includes(k));
  if (mightNeedThreshold && !THRESHOLD.test(text)) flags.push("missing_threshold");

  if (flags.length === 0) flags.push("valid");

  // Infer ASIL from related test cases
  const asilValues = relatedCases.map(tc => tc.asil);
  const asilPriority: ASIL[] = ["D", "C", "B", "A", "QM"];
  const topAsil = asilPriority.find(a => asilValues.includes(a)) ?? "QM";

  // Risk classification
  let risk: "high" | "medium" | "low" = "low";
  if (topAsil === "D" || topAsil === "C") risk = "high";
  else if (topAsil === "B" || topAsil === "A") risk = "medium";
  if (!covered) risk = topAsil === "QM" ? "medium" : "high";
  if (flags.includes("missing_timing") || flags.includes("missing_threshold")) {
    if (risk === "low") risk = "medium";
  }

  return { id, text, flags, risk, asil: topAsil, covered };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch { return "—"; }
}

// ─── Small components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--c-surface)", border: "1px solid var(--c-border)",
        borderRadius: 13, padding: "16px 18px",
        display: "flex", alignItems: "center", gap: 12,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: color + "18", border: `1px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} color={color} strokeWidth={1.75} />
      </div>
      <div>
        <div style={{ fontSize: "1.375rem", fontWeight: 800, color: "var(--c-text)", lineHeight: 1, letterSpacing: "-0.03em" }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--c-text-3)", marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: "0.6875rem", color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

function SectionHeader({ title, sub, color }: { title: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--c-border)" }}>
      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>{title}</span>
      {sub && <span style={{ marginLeft: 8, fontSize: "0.75rem", color: color ?? "var(--c-text-3)" }}>{sub}</span>}
    </div>
  );
}

function BarRow({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "0.8125rem", color: "var(--c-text-2)", fontWeight: 500, textTransform: "capitalize" }}>
          {label.replace(/_/g, " ")}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", fontFamily: "var(--font-mono)" }}>{count}</span>
      </div>
      <div style={{ height: 5, background: "var(--c-border)", borderRadius: 3, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(count / Math.max(1, max)) * 100}%` }}
          transition={{ duration: 0.5 }}
          style={{ height: "100%", borderRadius: 3, background: color }}
        />
      </div>
    </div>
  );
}

// Flag descriptions shown in requirement rows
const FLAG_CONFIG: Record<ReqFlag, { label: string; color: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  valid:             { label: "Valid",                  color: "#10b981", icon: CheckCircle2 },
  ambiguous:         { label: "Ambiguous language",    color: "#f59e0b", icon: AlertTriangle },
  missing_timing:    { label: "Missing timing constraint", color: "#f97316", icon: AlertCircle },
  missing_threshold: { label: "Missing threshold",     color: "#f97316", icon: AlertCircle },
  incomplete:        { label: "Incomplete requirement", color: "#f87171", icon: XCircle },
};

function ReqRow({ req, index }: { req: ReqAnalysis; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasIssues = req.flags.some(f => f !== "valid");
  const riskColor = req.risk === "high" ? "#ef4444" : req.risk === "medium" ? "#f59e0b" : "#10b981";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      style={{
        borderBottom: "1px solid var(--c-border)",
        background: hasIssues ? "transparent" : "transparent",
      }}
    >
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--c-bg-2)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {/* Coverage indicator */}
        <div style={{ flexShrink: 0 }}>
          {req.covered
            ? <CheckCircle2 size={14} color="#10b981" />
            : <XCircle size={14} color="#f87171" />
          }
        </div>

        {/* Requirement ID */}
        <span style={{
          fontSize: "0.7rem", fontFamily: "var(--font-mono)", fontWeight: 600,
          color: "var(--c-accent)", flexShrink: 0, minWidth: 60,
        }}>
          {req.id || "REQ-?"}
        </span>

        {/* ASIL badge */}
        <span style={{
          fontSize: "0.6rem", fontWeight: 700, padding: "1px 5px", borderRadius: 4,
          background: ASIL_BG[req.asil] ?? ASIL_BG.QM,
          color: ASIL_COLORS[req.asil] ?? ASIL_COLORS.QM,
          border: `1px solid ${ASIL_COLORS[req.asil] ?? ASIL_COLORS.QM}30`,
          letterSpacing: "0.03em", flexShrink: 0,
        }}>
          {req.asil === "QM" ? "QM" : `ASIL-${req.asil}`}
        </span>

        {/* Requirement text */}
        <span style={{
          flex: 1, fontSize: "0.8125rem", color: "var(--c-text-2)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap",
        }}>
          {req.text}
        </span>

        {/* Flags */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {req.flags.filter(f => f !== "valid").map(f => {
            const cfg = FLAG_CONFIG[f];
            return (
              <span key={f} style={{
                fontSize: "0.6rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: cfg.color + "12", border: `1px solid ${cfg.color}30`,
                color: cfg.color, letterSpacing: "0.03em", whiteSpace: "nowrap",
              }}>
                {cfg.label}
              </span>
            );
          })}
        </div>

        {/* Risk dot */}
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: riskColor, boxShadow: `0 0 5px ${riskColor}60`,
        }} />
      </div>

      {/* Expanded flags */}
      {expanded && req.flags.some(f => f !== "valid") && (
        <div style={{ padding: "8px 48px 12px", background: "var(--c-bg-2)" }}>
          {req.flags.filter(f => f !== "valid").map(f => {
            const cfg = FLAG_CONFIG[f];
            return (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <cfg.icon size={13} color={cfg.color} />
                <span style={{ fontSize: "0.8125rem", color: cfg.color, fontWeight: 500 }}>
                  {flagDetail(f, req.text)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function flagDetail(flag: ReqFlag, text: string): string {
  switch (flag) {
    case "ambiguous": {
      const found = AMBIGUOUS_WORDS.find(w => text.toLowerCase().includes(w));
      return `Ambiguous term detected: "${found}" — replace with measurable criterion`;
    }
    case "missing_timing":
      return "No timing constraint found — specify response time (e.g. < 50 ms, within 100 ms)";
    case "missing_threshold":
      return "No numeric threshold — add measurable value (e.g. voltage < 14V, temp > -40°C)";
    case "incomplete":
      return "Requirement is too short — provide full system behavior description";
    default:
      return "";
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ValidationPage() {
  const { selectedProject } = useProject();
  const [searchParams] = useSearchParams();
  const urlRunId = searchParams.get("runId");

  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(urlRunId);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [requirements, setRequirements] = useState<{ id: string; text: string; position: number }[]>([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    async function load() {
      try {
        const r = await getProjectRuns(selectedProject!.id, 30);
        const completed = r.filter(run => run.status === "complete");
        setRuns(completed);
        if (!selectedRunId && completed.length > 0) setSelectedRunId(completed[0].id);
      } catch { /* ignore */ }
      finally { setLoadingRuns(false); }
    }
    load();
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedRunId) return;
    setLoadingData(true);
    setTestCases([]);
    setRequirements([]);
    Promise.all([
      getRunTestCases(selectedRunId),
      getRunRequirements(selectedRunId),
    ])
      .then(([tcs, reqs]) => {
        setTestCases(tcs);
        setRequirements(reqs);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [selectedRunId]);

  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null;

  // ─── Derived metrics ──────────────────────────────────────────────────────

  const {
    coveredCount, totalReqs, missingCount, coveragePct,
    asilDist, typeDist, duplicateCount,
    reqAnalyses, riskCounts, flagCounts,
  } = useMemo(() => {
    const coveredReqIds = new Set(testCases.map(tc => tc.requirement_id));
    const totalReqs = requirements.length || selectedRun?.requirement_count || 0;
    const coveredCount = coveredReqIds.size;
    const missingCount = Math.max(0, totalReqs - coveredCount);
    const coveragePct = totalReqs > 0 ? Math.round((coveredCount / totalReqs) * 100) : 0;

    const asilDist: Record<string, number> = {};
    const typeDist: Record<string, number> = {};
    const seenKeys = new Set<string>();
    let duplicateCount = 0;
    for (const tc of testCases) {
      asilDist[tc.asil] = (asilDist[tc.asil] ?? 0) + 1;
      typeDist[tc.test_type] = (typeDist[tc.test_type] ?? 0) + 1;
      const key = `${tc.requirement_id}::${tc.test_type}`;
      if (seenKeys.has(key)) duplicateCount++;
      else seenKeys.add(key);
    }

    // Requirement analyses
    const reqAnalyses: ReqAnalysis[] = requirements.map(req => {
      const related = testCases.filter(tc => tc.requirement_id === req.id);
      return analyzeRequirement(req.id, req.text, coveredReqIds.has(req.id), related);
    });

    const riskCounts = { high: 0, medium: 0, low: 0 };
    const flagCounts: Record<ReqFlag, number> = { valid: 0, ambiguous: 0, missing_timing: 0, missing_threshold: 0, incomplete: 0 };
    for (const ra of reqAnalyses) {
      riskCounts[ra.risk]++;
      for (const f of ra.flags) flagCounts[f]++;
    }

    return { coveredCount, totalReqs, missingCount, coveragePct, asilDist, typeDist, duplicateCount, reqAnalyses, riskCounts, flagCounts };
  }, [testCases, requirements, selectedRun]);

  const maxAsilCount = Math.max(1, ...Object.values(asilDist));
  const maxTypeCount = Math.max(1, ...Object.values(typeDist));
  const hasData = testCases.length > 0;
  const issueCount = flagCounts.ambiguous + flagCounts.missing_timing + flagCounts.missing_threshold + flagCounts.incomplete;

  return (
    <PageTransition>
      <div style={{ padding: "28px 32px 64px", maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <CheckCircle2 size={17} color="#10b981" strokeWidth={1.75} />
            </div>
            <div>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>
                Validation Center
              </h1>
              <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0 }}>
                Requirement quality, coverage analysis, and risk classification
              </p>
            </div>
          </div>

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

        {/* Loading / empty states */}
        {loadingRuns && (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={20} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {!loadingRuns && runs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 16, padding: "60px 40px", textAlign: "center",
            }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 13, margin: "0 auto 18px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 size={22} color="#10b981" strokeWidth={1.75} />
            </div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--c-text)", margin: "0 0 8px" }}>No completed runs yet</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--c-text-3)", margin: "0 0 22px", lineHeight: 1.6 }}>
              Generate test cases to enable validation analysis.
            </p>
            <Link to="/app/generate" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8, background: "var(--c-accent)", color: "white", textDecoration: "none", fontSize: "0.875rem", fontWeight: 600 }}>
              <Sparkles size={14} />
              Generate Test Cases
            </Link>
          </motion.div>
        )}

        {!loadingRuns && selectedRun && (
          <>
            {/* Run context strip */}
            <div style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 10, padding: "10px 16px", marginBottom: 18,
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", flexShrink: 0, display: "inline-block" }} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>
                {selectedRun.test_case_count} test cases · {selectedRun.requirement_count} requirements
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>
                {formatRelative(selectedRun.created_at)} · {formatDate(selectedRun.created_at)}
              </span>
              <Link
                to={`/app/traceability?runId=${selectedRun.id}`}
                style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--c-accent)", textDecoration: "none", fontWeight: 600 }}
              >
                View Traceability →
              </Link>
            </div>

            {loadingData ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                <Loader2 size={18} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* ── 1. KPI STRIP ──────────────────────────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10 }}>
                  <KpiCard
                    label="Requirements Covered"
                    value={`${coveredCount}/${totalReqs}`}
                    sub={`${coveragePct}% coverage`}
                    color="#10b981"
                    icon={GitBranch}
                  />
                  <KpiCard
                    label="Requirement Issues"
                    value={issueCount}
                    sub={issueCount === 0 ? "all requirements valid" : `${issueCount} need attention`}
                    color={issueCount > 0 ? "#f59e0b" : "#10b981"}
                    icon={AlertCircle}
                  />
                  <KpiCard
                    label="High Risk Items"
                    value={riskCounts.high}
                    sub={riskCounts.high === 0 ? "no high-risk requirements" : "require priority review"}
                    color={riskCounts.high > 0 ? "#ef4444" : "#10b981"}
                    icon={Shield}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10 }}>
                  <KpiCard
                    label="Generated Test Cases"
                    value={testCases.length}
                    sub={`~${(testCases.length / Math.max(1, totalReqs)).toFixed(1)} per requirement`}
                    color="#818cf8"
                    icon={Sparkles}
                  />
                  <KpiCard
                    label="Uncovered Requirements"
                    value={missingCount}
                    sub={missingCount === 0 ? "full coverage" : "missing test cases"}
                    color={missingCount > 0 ? "#f87171" : "#10b981"}
                    icon={FileText}
                  />
                  <KpiCard
                    label="Duplicate Cases"
                    value={duplicateCount}
                    sub={duplicateCount === 0 ? "no duplicates" : "same req + type pair"}
                    color={duplicateCount > 0 ? "#f59e0b" : "#10b981"}
                    icon={TrendingUp}
                  />
                </div>

                {/* ── 2. RISK & COVERAGE side by side ───────────────────── */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>

                  {/* Risk Analysis */}
                  <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 14, overflow: "hidden" }}>
                    <SectionHeader title="Risk Analysis" sub="by ASIL level and constraint completeness" />
                    <div style={{ padding: "16px 20px" }}>
                      {[
                        { label: "High Risk", value: riskCounts.high, color: "#ef4444", desc: "ASIL-C/D or uncovered safety requirements" },
                        { label: "Medium Risk", value: riskCounts.medium, color: "#f59e0b", desc: "ASIL-A/B or requirements with gaps" },
                        { label: "Low Risk", value: riskCounts.low, color: "#10b981", desc: "QM requirements fully covered and valid" },
                      ].map(r => {
                        const total = riskCounts.high + riskCounts.medium + riskCounts.low;
                        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
                        return (
                          <div key={r.label} style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <span style={{
                                  width: 8, height: 8, borderRadius: "50%", background: r.color,
                                  display: "inline-block", boxShadow: `0 0 5px ${r.color}60`,
                                }} />
                                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>{r.label}</span>
                                <span style={{ fontSize: "0.72rem", color: "var(--c-text-3)" }}>{r.desc}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{pct}%</span>
                                <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: r.color, minWidth: 24, textAlign: "right" }}>{r.value}</span>
                              </div>
                            </div>
                            <div style={{ height: 6, background: "var(--c-border)", borderRadius: 3, overflow: "hidden" }}>
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6 }}
                                style={{ height: "100%", borderRadius: 3, background: r.color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Coverage Summary */}
                  <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 14, overflow: "hidden" }}>
                    <SectionHeader title="Coverage Analysis" />
                    <div style={{ padding: "16px 20px" }}>
                      {/* Coverage donut */}
                      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 18 }}>
                        <svg width="88" height="88" viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
                          <circle cx="44" cy="44" r="36" fill="none" stroke="var(--c-border)" strokeWidth="8" />
                          <circle
                            cx="44" cy="44" r="36" fill="none"
                            stroke={coveragePct === 100 ? "#10b981" : coveragePct >= 80 ? "#f59e0b" : "#f87171"}
                            strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 36}`}
                            strokeDashoffset={`${2 * Math.PI * 36 * (1 - coveragePct / 100)}`}
                            transform="rotate(-90 44 44)"
                            style={{ transition: "stroke-dashoffset 0.8s ease" }}
                          />
                          <text x="44" y="44" textAnchor="middle" dominantBaseline="middle"
                            style={{ fill: "var(--c-text)", fontSize: "14px", fontWeight: "800", fontFamily: "var(--font)" }}>
                            {coveragePct}%
                          </text>
                        </svg>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[
                            { label: "Covered", value: coveredCount, color: "#10b981" },
                            { label: "Uncovered", value: missingCount, color: "#f87171" },
                            { label: "Total", value: totalReqs, color: "var(--c-text-2)" },
                          ].map(item => (
                            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                              <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: item.color }}>{item.value}</span>
                              <span style={{ fontSize: "0.72rem", color: "var(--c-text-3)" }}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* ASIL distribution */}
                      {ASIL_ORDER.filter(a => asilDist[a]).map(asil => (
                        <div key={asil} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{
                                padding: "1px 6px", borderRadius: 4, fontSize: "0.6rem", fontWeight: 700,
                                background: ASIL_BG[asil], color: ASIL_COLORS[asil],
                                border: `1px solid ${ASIL_COLORS[asil]}30`,
                              }}>
                                {asil === "QM" ? "QM" : `ASIL-${asil}`}
                              </span>
                              <span style={{ fontSize: "0.72rem", color: "var(--c-text-3)" }}>
                                {Math.round(((asilDist[asil] ?? 0) / testCases.length) * 100)}%
                              </span>
                            </div>
                            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text-2)", fontFamily: "var(--font-mono)" }}>
                              {asilDist[asil]}
                            </span>
                          </div>
                          <div style={{ height: 4, background: "var(--c-border)", borderRadius: 2, overflow: "hidden" }}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${((asilDist[asil] ?? 0) / maxAsilCount) * 100}%` }}
                              transition={{ duration: 0.5 }}
                              style={{ height: "100%", borderRadius: 2, background: ASIL_COLORS[asil] }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── 3. REQUIREMENT VALIDATION ────────────────────────── */}
                {reqAnalyses.length > 0 && (
                  <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 14, overflow: "hidden" }}>
                    <div style={{
                      padding: "14px 20px", borderBottom: "1px solid var(--c-border)",
                      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
                    }}>
                      <div>
                        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>Requirement Quality Analysis</span>
                        <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--c-text-3)" }}>
                          {reqAnalyses.filter(r => r.flags.some(f => f !== "valid")).length} requirements have issues
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(Object.entries(flagCounts) as [ReqFlag, number][])
                          .filter(([k, v]) => k !== "valid" && v > 0)
                          .map(([flag, count]) => {
                            const cfg = FLAG_CONFIG[flag];
                            return (
                              <span key={flag} style={{
                                fontSize: "0.68rem", fontWeight: 600, padding: "2px 8px", borderRadius: 5,
                                background: cfg.color + "12", border: `1px solid ${cfg.color}30`,
                                color: cfg.color,
                              }}>
                                {count} {cfg.label}
                              </span>
                            );
                          })}
                      </div>
                    </div>

                    {/* Legend row */}
                    <div style={{
                      display: "flex", gap: 16, padding: "8px 16px",
                      background: "var(--c-bg-2)", borderBottom: "1px solid var(--c-border)",
                      fontSize: "0.6875rem", color: "var(--c-text-3)", flexWrap: "wrap",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={11} color="#10b981" /> Covered</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><XCircle size={11} color="#f87171" /> Uncovered</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} /> High risk</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} /> Medium risk</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} /> Low risk</span>
                      <span style={{ color: "var(--c-text-3)", marginLeft: "auto" }}>Click a row to see issue details</span>
                    </div>

                    <div style={{ overflowX: "auto" }}>
                      {reqAnalyses.map((req, i) => (
                        <ReqRow key={req.id || i} req={req} index={i} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── 4. TEST TYPE DISTRIBUTION ─────────────────────────── */}
                {Object.keys(typeDist).length > 0 && (
                  <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 14, overflow: "hidden" }}>
                    <SectionHeader title="Test Type Distribution" />
                    <div style={{ padding: "16px 20px" }}>
                      {Object.entries(typeDist)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                          <BarRow key={type} label={type} count={count} max={maxTypeCount} color={TYPE_COLORS[type] ?? "#818cf8"} />
                        ))}
                    </div>
                  </div>
                )}

                {/* Info note when no requirement text */}
                {reqAnalyses.length === 0 && hasData && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "14px 18px",
                    borderRadius: 10, background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
                  }}>
                    <Info size={15} color="var(--c-text-3)" />
                    <span style={{ fontSize: "0.8125rem", color: "var(--c-text-3)" }}>
                      Requirement text not available for this run — requirement quality analysis requires requirement text to be stored during generation.
                    </span>
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
