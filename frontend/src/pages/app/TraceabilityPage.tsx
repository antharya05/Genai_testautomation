import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  GitBranch,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProjectRuns, getRunRequirements, getRunTestCases } from "../../api/client";
import { useProject } from "../../context/ProjectContext";
import { PageTransition } from "../../components/layout/PageTransition";
import type { Run, TestCase } from "../../types";

const ASIL_COLORS: Record<string, string> = {
  QM: "#94a3b8", A: "#10b981", B: "#f59e0b", C: "#f97316", D: "#ef4444",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

interface Requirement {
  id: string;
  text: string;
  position: number;
}

type CoverageFilter = "all" | "covered" | "uncovered";

export default function TraceabilityPage() {
  const { selectedProject } = useProject();
  const [searchParams] = useSearchParams();
  const urlRunId = searchParams.get("runId");

  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(urlRunId);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [showRunPicker, setShowRunPicker] = useState(false);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  // Multi-expand: a Set of expanded req IDs
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");

  // Load completed runs
  useEffect(() => {
    if (!selectedProject) return;
    getProjectRuns(selectedProject.id, 30)
      .then(r => {
        const completed = r.filter(run => run.status === "complete");
        setRuns(completed);
        if (!urlRunId && completed.length > 0) {
          setSelectedRunId(completed[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRuns(false));
  }, [urlRunId, selectedProject]);

  // Load requirements + test cases when run changes
  useEffect(() => {
    if (!selectedRunId) return;
    let cancelled = false;
    setLoadingData(true);
    setRequirements([]);
    setTestCases([]);
    setExpandedIds(new Set());
    Promise.all([
      getRunTestCases(selectedRunId),
      getRunRequirements(selectedRunId),
    ]).then(([tcs, reqs]) => {
      if (!cancelled) {
        setTestCases(tcs);
        setRequirements(reqs);
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setLoadingData(false); });
    return () => { cancelled = true; };
  }, [selectedRunId]);

  const selectedRun = runs.find(r => r.id === selectedRunId);

  const matrix = useMemo(() => {
    return requirements.map(req => {
      const linked = testCases.filter(tc => {
        if (tc.source_requirement_text && tc.source_requirement_text === req.text) return true;
        const m = tc.requirement_id?.match(/REQ-(\d+)/i);
        if (m) return parseInt(m[1]) - 1 === req.position;
        return false;
      });
      return { req, linked };
    });
  }, [requirements, testCases]);

  const covered = matrix.filter(m => m.linked.length > 0).length;
  const coveragePct = matrix.length > 0 ? Math.round((covered / matrix.length) * 100) : 0;
  const coverageColor = coveragePct === 100 ? "#10b981" : coveragePct >= 80 ? "#f59e0b" : "#f87171";

  const filteredMatrix = useMemo(() => {
    if (coverageFilter === "covered") return matrix.filter(m => m.linked.length > 0);
    if (coverageFilter === "uncovered") return matrix.filter(m => m.linked.length === 0);
    return matrix;
  }, [matrix, coverageFilter]);

  // Expandable rows in current filtered view
  const expandableIds = filteredMatrix.filter(m => m.linked.length > 0).map(m => m.req.id);
  const allExpanded = expandableIds.length > 0 && expandableIds.every(id => expandedIds.has(id));

  function toggleExpandAll() {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(expandableIds));
    }
  }

  function toggleRow(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PageTransition>
      <div style={{ padding: "28px 32px 64px", maxWidth: 1100 }}>

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <GitBranch size={17} color="#60a5fa" strokeWidth={1.75} />
            </div>
            <div>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>
                Traceability
              </h1>
              <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0 }}>
                {selectedRun
                  ? `${requirements.length} requirements · ${testCases.length} test cases · ${formatDate(selectedRun.created_at)}`
                  : "Requirement-to-test coverage matrix"}
              </p>
            </div>
          </div>

          {/* Run selector */}
          {!loadingRuns && runs.length > 0 && (
            <div style={{ position: "relative" }}>
              {showRunPicker && (
                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowRunPicker(false)} />
              )}
              <button
                onClick={() => setShowRunPicker(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "7px 12px", borderRadius: 8,
                  background: "var(--c-surface)", border: "1px solid var(--c-border)",
                  color: "var(--c-text-2)", fontSize: "0.8125rem", fontWeight: 500,
                  cursor: "pointer", fontFamily: "var(--font)", transition: "border-color 0.15s ease",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border-2)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border)"; }}
              >
                {selectedRun
                  ? `${selectedRun.requirement_count} reqs · ${formatDate(selectedRun.created_at)}`
                  : "Select run"}
                <ChevronDown size={13} />
              </button>

              <AnimatePresence>
                {showRunPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.14 }}
                    style={{
                      position: "absolute", top: "calc(100% + 4px)", right: 0,
                      background: "var(--c-surface)", border: "1px solid var(--c-border)",
                      borderRadius: 10, zIndex: 100, minWidth: 280,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.2)", maxHeight: 320, overflowY: "auto",
                    }}
                  >
                    {runs.map(run => (
                      <button
                        key={run.id}
                        onClick={() => { setSelectedRunId(run.id); setShowRunPicker(false); }}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 14px",
                          background: run.id === selectedRunId ? "var(--c-accent-dim)" : "transparent",
                          border: "none", borderBottom: "1px solid var(--c-border)",
                          cursor: "pointer", fontFamily: "var(--font)", textAlign: "left",
                          color: run.id === selectedRunId ? "var(--c-accent)" : "var(--c-text-2)",
                          transition: "background 0.1s ease",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                            {run.requirement_count} reqs · {run.test_case_count} cases
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 2 }}>
                            {run.model?.split("-").slice(0, 2).join("-") ?? run.provider ?? "—"}
                          </div>
                        </div>
                        <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", flexShrink: 0 }}>
                          {formatDate(run.created_at)}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── Empty state ───────────────────────────────────── */}
        {!loadingRuns && runs.length === 0 && (
          <div style={{
            background: "var(--c-surface)", border: "1px solid var(--c-border)",
            borderRadius: 14, padding: "56px 32px", textAlign: "center",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px",
              background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <GitBranch size={24} color="#60a5fa" strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--c-text)", margin: "0 0 8px" }}>
              No traceability data yet
            </h2>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: "0 0 20px", lineHeight: 1.6 }}>
              Generate test cases first to see requirement-to-test traceability.
            </p>
            <Link to="/app/generate" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 18px", borderRadius: 8, background: "var(--c-accent)",
              color: "white", textDecoration: "none", fontSize: "0.8125rem", fontWeight: 600,
            }}>
              <Sparkles size={13} />
              Generate Test Cases
            </Link>
          </div>
        )}

        {(loadingRuns || loadingData) && (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
            <Loader2 size={22} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* ── Coverage summary ──────────────────────────────── */}
        {!loadingData && matrix.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 12, padding: "14px 18px", marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: "1.875rem", fontWeight: 800, color: coverageColor, letterSpacing: "-0.035em", lineHeight: 1 }}>
                  {coveragePct}%
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 2, fontWeight: 500 }}>
                  coverage
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--c-text-2)" }}>
                    {covered} of {matrix.length} requirements covered
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>
                    {testCases.length} test cases total
                  </span>
                </div>
                <div style={{ height: 6, background: "var(--c-border)", borderRadius: 4 }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${coveragePct}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{ height: "100%", borderRadius: 4, background: coverageColor }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Toolbar: filter + expand all ─────────────────── */}
        {!loadingData && matrix.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
            justifyContent: "space-between",
          }}>
            {/* Coverage filter */}
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginRight: 2 }}>
                Filter
              </span>
              {(["all", "covered", "uncovered"] as CoverageFilter[]).map(f => {
                const label = f === "all" ? `All (${matrix.length})` : f === "covered" ? `Covered (${covered})` : `Uncovered (${matrix.length - covered})`;
                const active = coverageFilter === f;
                const accent = f === "covered" ? "#10b981" : f === "uncovered" ? "#f87171" : "var(--c-accent)";
                return (
                  <button
                    key={f}
                    onClick={() => setCoverageFilter(f)}
                    style={{
                      fontSize: "0.75rem", fontWeight: 500, padding: "4px 11px",
                      borderRadius: 6, border: "1px solid",
                      cursor: "pointer", fontFamily: "var(--font)",
                      background: active ? accent + "18" : "var(--c-surface)",
                      color: active ? accent : "var(--c-text-3)",
                      borderColor: active ? accent + "40" : "var(--c-border)",
                      transition: "all 0.12s ease",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Expand all / Collapse all */}
            {expandableIds.length > 0 && (
              <button
                onClick={toggleExpandAll}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 11px", borderRadius: 7,
                  background: "var(--c-surface)", border: "1px solid var(--c-border)",
                  color: "var(--c-text-2)", fontSize: "0.75rem", fontWeight: 500,
                  cursor: "pointer", fontFamily: "var(--font)", transition: "border-color 0.12s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border-2)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border)"; }}
              >
                {allExpanded
                  ? <><ChevronsDownUp size={13} /> Collapse all</>
                  : <><ChevronsUpDown size={13} /> Expand all</>
                }
              </button>
            )}
          </div>
        )}

        {/* ── Traceability matrix ───────────────────────────── */}
        {!loadingData && filteredMatrix.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            style={{
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 14, overflow: "hidden",
            }}
          >
            {/* Column header */}
            <div style={{
              display: "grid", gridTemplateColumns: "20px 1fr 64px",
              padding: "8px 16px",
              background: "var(--c-bg-2)", borderBottom: "1px solid var(--c-border)",
              fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              <span />
              <span>Requirement</span>
              <span style={{ textAlign: "right" }}>Tests</span>
            </div>

            {filteredMatrix.map(({ req, linked }, i) => {
              const isExpanded = expandedIds.has(req.id);
              const isLast = i === filteredMatrix.length - 1;

              return (
                <div key={req.id}>
                  <div
                    role={linked.length > 0 ? "button" : undefined}
                    onClick={() => linked.length > 0 && toggleRow(req.id)}
                    style={{
                      display: "grid", gridTemplateColumns: "20px 1fr 64px",
                      padding: "11px 16px", alignItems: "start",
                      borderBottom: (!isLast || isExpanded) ? "1px solid var(--c-border)" : "none",
                      cursor: linked.length > 0 ? "pointer" : "default",
                      background: isExpanded ? "rgba(99,102,241,0.03)" : "transparent",
                      transition: "background 0.12s ease",
                    }}
                    onMouseEnter={e => {
                      if (linked.length > 0)
                        (e.currentTarget as HTMLElement).style.background = "var(--c-bg-2)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background =
                        isExpanded ? "rgba(99,102,241,0.03)" : "transparent";
                    }}
                  >
                    <div style={{ paddingTop: 3 }}>
                      {linked.length > 0
                        ? <CheckCircle2 size={13} color="#10b981" />
                        : <AlertCircle size={13} color="#f87171" />
                      }
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{
                          fontSize: "0.6875rem", fontFamily: "var(--font-mono)",
                          color: "var(--c-text-3)", flexShrink: 0,
                        }}>
                          #{String(req.position + 1).padStart(2, "0")}
                        </span>
                        {linked.length > 0 && (
                          <motion.span
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.18 }}
                            style={{ display: "inline-flex", color: "var(--c-text-3)" }}
                          >
                            <ChevronDown size={11} />
                          </motion.span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--c-text-2)", lineHeight: 1.5, maxWidth: 720 }}>
                        {req.text}
                      </div>
                      {linked.length > 0 && !isExpanded && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                          {linked.slice(0, 5).map(tc => (
                            <span key={tc.test_id} style={{
                              fontSize: "0.6875rem", fontFamily: "var(--font-mono)",
                              padding: "1px 6px", borderRadius: 4,
                              background: (ASIL_COLORS[tc.asil] ?? "#94a3b8") + "15",
                              color: ASIL_COLORS[tc.asil] ?? "#94a3b8",
                              border: `1px solid ${(ASIL_COLORS[tc.asil] ?? "#94a3b8")}30`,
                            }}>
                              {tc.test_id}
                            </span>
                          ))}
                          {linked.length > 5 && (
                            <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", alignSelf: "center" }}>
                              +{linked.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: "right", paddingTop: 1 }}>
                      <span style={{
                        fontSize: "1rem", fontWeight: 700,
                        color: linked.length > 0 ? "var(--c-text)" : "var(--c-text-3)",
                        letterSpacing: "-0.02em",
                      }}>
                        {linked.length}
                      </span>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        style={{ overflow: "hidden" }}
                      >
                        <div style={{
                          background: "var(--c-bg-2)",
                          borderBottom: !isLast ? "1px solid var(--c-border)" : "none",
                          padding: "10px 16px 10px 36px",
                        }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {linked.map(tc => (
                              <div key={tc.test_id} style={{
                                display: "flex", alignItems: "flex-start", gap: 10,
                                padding: "9px 13px", borderRadius: 9,
                                background: "var(--c-surface)", border: "1px solid var(--c-border)",
                              }}>
                                <span style={{
                                  fontSize: "0.6875rem", fontFamily: "var(--font-mono)",
                                  color: "var(--c-text-3)", flexShrink: 0, paddingTop: 2,
                                  minWidth: 68,
                                }}>
                                  {tc.test_id}
                                </span>
                                <span style={{ fontSize: "0.8125rem", color: "var(--c-text)", flex: 1, lineHeight: 1.4 }}>
                                  {tc.title}
                                </span>
                                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                  <span style={{
                                    fontSize: "0.6875rem", fontWeight: 700,
                                    padding: "2px 7px", borderRadius: 5,
                                    background: (ASIL_COLORS[tc.asil] ?? "#94a3b8") + "20",
                                    color: ASIL_COLORS[tc.asil] ?? "#94a3b8",
                                    border: `1px solid ${(ASIL_COLORS[tc.asil] ?? "#94a3b8")}40`,
                                  }}>
                                    {tc.asil}
                                  </span>
                                  <span style={{
                                    fontSize: "0.6875rem", fontWeight: 500,
                                    padding: "2px 7px", borderRadius: 5,
                                    background: "var(--c-bg)", color: "var(--c-text-3)",
                                    border: "1px solid var(--c-border)", textTransform: "capitalize",
                                  }}>
                                    {tc.test_type.replace(/_/g, " ")}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        )}

        {/* ── Empty filter result ───────────────────────────── */}
        {!loadingData && matrix.length > 0 && filteredMatrix.length === 0 && (
          <div style={{
            background: "var(--c-surface)", border: "1px solid var(--c-border)",
            borderRadius: 12, padding: "32px 24px", textAlign: "center",
          }}>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: 0 }}>
              No requirements match the current filter.
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}

// ─── Shared placeholder component (used by KnowledgeBasePage) ────────────────

interface PlaceholderCardProps {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  iconBorder: string;
  title: string;
  description: string;
  planned: string[];
}

export function PlaceholderCard({
  icon: Icon, iconColor, iconBg, iconBorder, title, description, planned,
}: PlaceholderCardProps) {
  return (
    <div style={{
      background: "var(--c-surface)", border: "1px solid var(--c-border)",
      borderRadius: 16, padding: "32px",
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, marginBottom: 16,
          background: iconBg, border: `1px solid ${iconBorder}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={24} color={iconColor} strokeWidth={1.5} />
        </div>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--c-text)", margin: "0 0 10px", letterSpacing: "-0.02em" }}>
          {title}
        </h2>
        <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: 0, maxWidth: 480, lineHeight: 1.65 }}>
          {description}
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 10,
      }}>
        {planned.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            padding: "12px 14px", borderRadius: 10,
            background: "var(--c-bg-2)", border: "1px solid var(--c-border)",
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: iconColor, marginTop: 5, opacity: 0.6,
            }} />
            <span style={{ fontSize: "0.8125rem", color: "var(--c-text-2)", lineHeight: 1.5 }}>
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
