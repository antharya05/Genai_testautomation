import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ListChecks, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProjectRuns, getRunTestCases } from "../../api/client";
import { ExportModal } from "../../components/export/ExportModal";
import { PageTransition } from "../../components/layout/PageTransition";
import { TestCaseTable } from "../../components/review/TestCaseTable";
import { ToastContainer } from "../../components/ui/Toast";
import { useToast } from "../../hooks/useToast";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import type { Run, TestCase } from "../../types";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

export default function TestCasesPage() {
  const [searchParams] = useSearchParams();
  const urlRunId = searchParams.get("runId");

  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(urlRunId);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  const [showRunPicker, setShowRunPicker] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const {
    state: testCases,
    set: setTestCases,
    undo, redo, reset,
    canUndo, canRedo,
  } = useUndoRedo<TestCase[]>([]);
  const { toasts, push: pushToast, dismiss } = useToast();

  // Load completed runs for the selector
  useEffect(() => {
    getProjectRuns(DEFAULT_PROJECT_ID, 30)
      .then(r => {
        const completed = r.filter(run => run.status === "complete");
        setRuns(completed);
        if (!urlRunId && completed.length > 0) {
          setSelectedRunId(completed[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRuns(false));
  }, [urlRunId]);

  // Load test cases when the selected run changes
  useEffect(() => {
    if (!selectedRunId) return;
    let cancelled = false;
    setLoadingCases(true);
    reset([]);
    getRunTestCases(selectedRunId)
      .then(tcs => { if (!cancelled) reset(tcs); })
      .catch(() => { if (!cancelled) reset([]); })
      .finally(() => { if (!cancelled) setLoadingCases(false); });
    return () => { cancelled = true; };
  }, [selectedRunId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedRun = runs.find(r => r.id === selectedRunId);

  const coverageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    testCases.forEach(tc => { counts[tc.test_type] = (counts[tc.test_type] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [testCases]);

  function handleEdit(id: string, field: keyof TestCase, value: string) {
    setTestCases(prev => prev.map(tc => tc.test_id === id ? { ...tc, [field]: value } : tc));
  }

  function handleDelete(id: string) {
    setTestCases(prev => prev.filter(tc => tc.test_id !== id));
    pushToast("info", "Test case removed from view");
  }

  return (
    <PageTransition>
      <div style={{ padding: "28px 32px 64px", maxWidth: 1280 }}>

        {/* ── Header ───────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ListChecks size={17} color="#818cf8" strokeWidth={1.75} />
            </div>
            <div>
              <h1 style={{
                fontSize: "1.25rem", fontWeight: 700, color: "var(--c-text)",
                letterSpacing: "-0.02em", margin: 0,
              }}>
                Test Cases
              </h1>
              <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0 }}>
                {selectedRun
                  ? `${selectedRun.test_case_count} cases · ${selectedRun.requirement_count} reqs · ${formatDate(selectedRun.created_at)}`
                  : "Select a completed run"}
              </p>
            </div>
          </div>

          {/* Run selector */}
          {!loadingRuns && runs.length > 0 && (
            <div style={{ position: "relative" }}>
              {showRunPicker && (
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 99 }}
                  onClick={() => setShowRunPicker(false)}
                />
              )}
              <button
                onClick={() => setShowRunPicker(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "7px 12px", borderRadius: 8,
                  background: "var(--c-surface)", border: "1px solid var(--c-border)",
                  color: "var(--c-text-2)", fontSize: "0.8125rem", fontWeight: 500,
                  cursor: "pointer", fontFamily: "var(--font)",
                  transition: "border-color 0.15s ease",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border-2)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--c-border)"; }}
              >
                {selectedRun
                  ? `${selectedRun.test_case_count} cases · ${formatDate(selectedRun.created_at)}`
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
                      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                      maxHeight: 320, overflowY: "auto",
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
                            {run.test_case_count} cases · {run.requirement_count} reqs
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

        {/* ── No runs ───────────────────────────────────────── */}
        {!loadingRuns && runs.length === 0 && (
          <div style={{
            background: "var(--c-surface)", border: "1px solid var(--c-border)",
            borderRadius: 14, padding: "56px 32px", textAlign: "center",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px",
              background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ListChecks size={24} color="#818cf8" strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--c-text)", margin: "0 0 8px" }}>
              No test cases yet
            </h2>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: "0 0 20px", lineHeight: 1.6 }}>
              Generate test cases from a requirements document to populate this view.
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

        {/* ── Loading runs ──────────────────────────────────── */}
        {loadingRuns && (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
            <Loader2 size={22} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* ── Coverage summary bar ──────────────────────────── */}
        {selectedRunId && !loadingCases && testCases.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
              padding: "10px 14px", marginBottom: 14,
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              borderRadius: 10,
            }}
          >
            <span style={{
              fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)",
              letterSpacing: "0.04em", textTransform: "uppercase", marginRight: 4,
            }}>
              Coverage
            </span>
            {coverageCounts.map(([type, count]) => (
              <span key={type} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 9px", borderRadius: 5, fontSize: "0.75rem", fontWeight: 600,
                background: (TYPE_COLORS[type] ?? "#818cf8") + "15",
                color: TYPE_COLORS[type] ?? "#818cf8",
                border: `1px solid ${(TYPE_COLORS[type] ?? "#818cf8")}30`,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                  background: TYPE_COLORS[type] ?? "#818cf8",
                }} />
                {type.replace(/_/g, " ")} {count}
              </span>
            ))}
            <span style={{ marginLeft: "auto", fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
              {testCases.length} total
            </span>
          </motion.div>
        )}

        {/* ── Loading test cases ────────────────────────────── */}
        {loadingCases && (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
            <Loader2 size={22} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* ── Test case table ───────────────────────────────── */}
        {!loadingCases && testCases.length > 0 && (
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
        )}

        {/* ── Empty run (selected run has 0 cases) ─────────── */}
        {!loadingCases && selectedRunId && testCases.length === 0 && runs.length > 0 && (
          <div style={{
            background: "var(--c-surface)", border: "1px solid var(--c-border)",
            borderRadius: 12, padding: "36px 24px", textAlign: "center",
          }}>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: 0 }}>
              No test cases found for this run.
            </p>
          </div>
        )}
      </div>

      {showExport && (
        <ExportModal
          testCases={testCases}
          onClose={() => setShowExport(false)}
          onToast={pushToast}
        />
      )}

      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}
