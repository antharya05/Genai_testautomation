import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  GitBranch,
  Loader2,
  Shield,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProjectRuns, getRunRequirements, getRunTestCases } from "../../api/client";
import { PageTransition } from "../../components/layout/PageTransition";
import type { Run, TestCase } from "../../types";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

const ASIL_ORDER = ["D", "C", "B", "A", "QM"];
const ASIL_COLORS: Record<string, string> = {
  QM: "#94a3b8", A: "#10b981", B: "#f59e0b", C: "#f97316", D: "#ef4444",
};
const ASIL_BG: Record<string, string> = {
  QM: "rgba(148,163,184,0.1)", A: "rgba(16,185,129,0.1)",
  B: "rgba(245,158,11,0.1)", C: "rgba(249,115,22,0.1)", D: "rgba(239,68,68,0.1)",
};

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

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "var(--c-surface)", border: "1px solid var(--c-border)",
        borderRadius: 13, padding: "18px 20px",
        display: "flex", alignItems: "center", gap: 14,
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 9, flexShrink: 0,
        background: color + "18", border: `1px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={17} color={color} strokeWidth={1.75} />
      </div>
      <div>
        <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--c-text)", lineHeight: 1, letterSpacing: "-0.03em" }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: "0.6875rem", color: color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

// ─── Check row ─────────────────────────────────────────────────────────────────

function CheckRow({ pass, label }: { pass: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--c-border)" }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
        background: pass ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {pass
          ? <CheckCircle2 size={13} color="#10b981" strokeWidth={2} />
          : <AlertCircle size={13} color="#f87171" strokeWidth={2} />
        }
      </div>
      <span style={{ fontSize: "0.875rem", color: pass ? "var(--c-text)" : "var(--c-text-2)", fontWeight: pass ? 500 : 400 }}>
        {label}
      </span>
      <span style={{
        marginLeft: "auto", fontSize: "0.6875rem", fontWeight: 700, padding: "2px 7px", borderRadius: 5,
        background: pass ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.08)",
        border: `1px solid ${pass ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.18)"}`,
        color: pass ? "#10b981" : "#f87171",
      }}>
        {pass ? "PASS" : "FAIL"}
      </span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ValidationPage() {
  const [searchParams] = useSearchParams();
  const urlRunId = searchParams.get("runId");

  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(urlRunId);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [requirementCount, setRequirementCount] = useState(0);
  const [requirementIds, setRequirementIds] = useState<string[]>([]);

  // Load completed runs for run picker
  useEffect(() => {
    getProjectRuns(DEFAULT_PROJECT_ID, 30)
      .then(r => {
        const completed = r.filter(run => run.status === "complete");
        setRuns(completed);
        if (!selectedRunId && completed.length > 0) {
          setSelectedRunId(completed[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRuns(false));
  }, []);

  // Load data for selected run
  useEffect(() => {
    if (!selectedRunId) return;
    setLoadingData(true);
    setTestCases([]);
    setRequirementCount(0);
    setRequirementIds([]);

    Promise.all([
      getRunTestCases(selectedRunId),
      getRunRequirements(selectedRunId),
    ])
      .then(([tcs, reqs]) => {
        setTestCases(tcs);
        setRequirementCount(reqs.length);
        setRequirementIds(reqs.map(r => r.id));
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [selectedRunId]);

  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null;

  // ── Compute validation metrics ───────────────────────────────────────────────

  const coveredReqIds = new Set(testCases.map(tc => tc.requirement_id));
  const coveredCount = coveredReqIds.size;
  const totalReqs = requirementCount || selectedRun?.requirement_count || 0;
  const missingCount = Math.max(0, totalReqs - coveredCount);
  const coveragePct = totalReqs > 0 ? Math.round((coveredCount / totalReqs) * 100) : 0;

  // Duplicate detection: same requirement_id + same test_type
  const seenKeys = new Set<string>();
  let duplicateCount = 0;
  for (const tc of testCases) {
    const key = `${tc.requirement_id}::${tc.test_type}`;
    if (seenKeys.has(key)) duplicateCount++;
    else seenKeys.add(key);
  }

  // ASIL distribution
  const asilDist: Record<string, number> = {};
  for (const tc of testCases) {
    asilDist[tc.asil] = (asilDist[tc.asil] ?? 0) + 1;
  }
  const maxAsilCount = Math.max(1, ...Object.values(asilDist));

  // Test type distribution
  const typeDist: Record<string, number> = {};
  for (const tc of testCases) {
    typeDist[tc.test_type] = (typeDist[tc.test_type] ?? 0) + 1;
  }
  const maxTypeCount = Math.max(1, ...Object.values(typeDist));

  const TYPE_COLORS: Record<string, string> = {
    functional: "#818cf8", boundary: "#34d399", negative: "#f87171",
    fault_injection: "#fb923c", timing: "#60a5fa", safety: "#a78bfa",
    recovery: "#4ade80", stress: "#f472b6",
  };

  const allCovered = missingCount === 0 && totalReqs > 0;
  const noDuplicates = duplicateCount === 0;
  const hasData = testCases.length > 0;

  return (
    <PageTransition>
      <div style={{ padding: "28px 32px 48px", maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
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
                Validation
              </h1>
              <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0 }}>
                Coverage and quality analysis for generated test assets
              </p>
            </div>
          </div>

          {/* Run selector */}
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

        {/* Loading */}
        {loadingRuns && (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={20} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* No runs */}
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
              Run a generation to see validation metrics here.
            </p>
            <Link
              to="/app/generate"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 18px", borderRadius: 8,
                background: "var(--c-accent)", color: "white", textDecoration: "none",
                fontSize: "0.875rem", fontWeight: 600,
              }}
            >
              <Sparkles size={14} />
              Generate Test Cases
            </Link>
          </motion.div>
        )}

        {/* Data loaded */}
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
                {selectedRun.test_case_count} test cases from {selectedRun.requirement_count} requirements
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14, alignItems: "start" }}>

                {/* Left column */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* KPI strip */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                    <KpiCard
                      label="Requirements Covered"
                      value={`${coveredCount} / ${totalReqs}`}
                      sub={totalReqs > 0 ? `${coveragePct}% coverage` : undefined}
                      color="#10b981"
                      icon={GitBranch}
                    />
                    <KpiCard
                      label="Generated Test Cases"
                      value={testCases.length}
                      sub={totalReqs > 0 ? `~${(testCases.length / Math.max(1, totalReqs)).toFixed(1)} per requirement` : undefined}
                      color="#818cf8"
                      icon={Sparkles}
                    />
                    <KpiCard
                      label="Missing Requirements"
                      value={missingCount}
                      sub={missingCount > 0 ? "requirements without test cases" : "all requirements covered"}
                      color={missingCount > 0 ? "#f87171" : "#10b981"}
                      icon={FileText}
                    />
                    <KpiCard
                      label="Duplicate Test Cases"
                      value={duplicateCount}
                      sub={duplicateCount > 0 ? "same req + test type pairs" : "no duplicates detected"}
                      color={duplicateCount > 0 ? "#f59e0b" : "#10b981"}
                      icon={Shield}
                    />
                  </div>

                  {/* Validation Status */}
                  <div style={{
                    background: "var(--c-surface)", border: "1px solid var(--c-border)",
                    borderRadius: 14, overflow: "hidden",
                  }}>
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--c-border)" }}>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>Validation Status</span>
                    </div>
                    <div style={{ padding: "4px 20px 8px" }}>
                      <CheckRow
                        pass={allCovered && hasData}
                        label={allCovered && hasData
                          ? `All ${totalReqs} requirements are mapped to test cases`
                          : missingCount > 0
                            ? `${missingCount} requirement${missingCount !== 1 ? "s" : ""} have no test cases`
                            : "No run data loaded"
                        }
                      />
                      <CheckRow
                        pass={noDuplicates && hasData}
                        label={noDuplicates && hasData
                          ? "No duplicate test cases detected"
                          : `${duplicateCount} duplicate requirement+type pair${duplicateCount !== 1 ? "s" : ""} detected`
                        }
                      />
                      <CheckRow
                        pass={coveragePct === 100 && hasData}
                        label={`Coverage: ${coveragePct}%${coveragePct === 100 && hasData ? " — complete" : coveragePct > 0 ? ` — ${100 - coveragePct}% gap remaining` : ""}`}
                      />
                    </div>
                  </div>

                  {/* Test Type Distribution */}
                  {Object.keys(typeDist).length > 0 && (
                    <div style={{
                      background: "var(--c-surface)", border: "1px solid var(--c-border)",
                      borderRadius: 14, padding: "16px 20px",
                    }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 14 }}>
                        Test Type Distribution
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {Object.entries(typeDist)
                          .sort((a, b) => b[1] - a[1])
                          .map(([type, count]) => (
                            <div key={type}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: "0.8125rem", color: "var(--c-text-2)", fontWeight: 500, textTransform: "capitalize" }}>
                                  {type.replace(/_/g, " ")}
                                </span>
                                <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", fontFamily: "var(--font-mono)" }}>{count}</span>
                              </div>
                              <div style={{ height: 5, background: "var(--c-border)", borderRadius: 3, overflow: "hidden" }}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(count / maxTypeCount) * 100}%` }}
                                  transition={{ duration: 0.5 }}
                                  style={{ height: "100%", borderRadius: 3, background: TYPE_COLORS[type] ?? "#818cf8" }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column — ASIL Distribution */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{
                    background: "var(--c-surface)", border: "1px solid var(--c-border)",
                    borderRadius: 14, padding: "16px 18px",
                  }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 14 }}>
                      ASIL Distribution
                    </div>
                    {ASIL_ORDER.filter(a => asilDist[a] !== undefined).length === 0 ? (
                      <p style={{ fontSize: "0.8125rem", color: "var(--c-text-3)", margin: 0 }}>No ASIL data available.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ASIL_ORDER.map(asil => {
                          const count = asilDist[asil] ?? 0;
                          if (count === 0) return null;
                          const pct = Math.round((count / testCases.length) * 100);
                          return (
                            <div key={asil}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{
                                    padding: "2px 8px", borderRadius: 5, fontSize: "0.7rem", fontWeight: 700,
                                    background: ASIL_BG[asil], color: ASIL_COLORS[asil],
                                    border: `1px solid ${ASIL_COLORS[asil]}30`, letterSpacing: "0.03em",
                                  }}>
                                    {asil === "QM" ? "QM" : `ASIL-${asil}`}
                                  </div>
                                  <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{pct}%</span>
                                </div>
                                <span style={{ fontSize: "0.8125rem", color: "var(--c-text-2)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>{count}</span>
                              </div>
                              <div style={{ height: 5, background: "var(--c-border)", borderRadius: 3, overflow: "hidden" }}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(count / maxAsilCount) * 100}%` }}
                                  transition={{ duration: 0.5, delay: ASIL_ORDER.indexOf(asil) * 0.05 }}
                                  style={{ height: "100%", borderRadius: 3, background: ASIL_COLORS[asil] }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Coverage circle */}
                  {totalReqs > 0 && (
                    <div style={{
                      background: "var(--c-surface)", border: "1px solid var(--c-border)",
                      borderRadius: 14, padding: "20px 18px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)", marginBottom: 16 }}>
                        Coverage Summary
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                        <svg width="110" height="110" viewBox="0 0 110 110">
                          <circle cx="55" cy="55" r="46" fill="none" stroke="var(--c-border)" strokeWidth="8" />
                          <circle
                            cx="55" cy="55" r="46" fill="none"
                            stroke={coveragePct === 100 ? "#10b981" : coveragePct >= 80 ? "#f59e0b" : "#f87171"}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 46}`}
                            strokeDashoffset={`${2 * Math.PI * 46 * (1 - coveragePct / 100)}`}
                            transform="rotate(-90 55 55)"
                            style={{ transition: "stroke-dashoffset 0.8s ease" }}
                          />
                          <text x="55" y="55" textAnchor="middle" dominantBaseline="middle"
                            style={{ fill: "var(--c-text)", fontSize: "18px", fontWeight: "800", fontFamily: "var(--font)" }}>
                            {coveragePct}%
                          </text>
                        </svg>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-around" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#10b981", lineHeight: 1 }}>{coveredCount}</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 3 }}>Covered</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "1.125rem", fontWeight: 700, color: missingCount > 0 ? "#f87171" : "var(--c-text-3)", lineHeight: 1 }}>{missingCount}</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 3 }}>Missing</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--c-text-2)", lineHeight: 1 }}>{totalReqs}</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 3 }}>Total</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}
