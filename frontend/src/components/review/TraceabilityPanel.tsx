import { motion } from "framer-motion";
import { useMemo } from "react";
import type { TestCase } from "../../types";
import { AsilBadge } from "../ui/Badge";

interface Props {
  requirements: string[];
  testCases: TestCase[];
}

function extractReqId(reqText: string): string {
  const m = reqText.match(/^(REQ[-_]\w+|SYS[-_]\w+|FR[-_]\w+|SWR[-_]\w+)/i);
  return m ? m[1].toUpperCase() : reqText.substring(0, 40);
}

export function TraceabilityPanel({ requirements, testCases }: Props) {
  const matrix = useMemo(() => {
    return requirements.map(req => {
      const reqId = extractReqId(req);
      const linked = testCases.filter(
        tc => tc.requirement_id === reqId || tc.source_requirement_text === req
      );
      return { reqId, reqText: req, linked };
    });
  }, [requirements, testCases]);

  const covered = matrix.filter(r => r.linked.length > 0).length;
  const coverage = requirements.length > 0 ? Math.round((covered / requirements.length) * 100) : 0;
  const coverageColor = coverage === 100 ? "#22C55E" : coverage >= 80 ? "#F59E0B" : "#EF4444";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{ padding: 0, overflow: "hidden" }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 20px", borderBottom: "1px solid var(--c-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--c-text)" }}>
            Traceability Matrix
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 2 }}>
            {covered} / {requirements.length} requirements covered
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: coverageColor, lineHeight: 1 }}>
            {coverage}%
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 2 }}>coverage</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "10px 20px", background: "var(--c-surface-2)", borderBottom: "1px solid var(--c-border)" }}>
        <div className="progress-track" style={{ height: 6 }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${coverage}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ height: "100%", borderRadius: "var(--r-full)", background: coverageColor }}
          />
        </div>
      </div>

      {/* Matrix rows */}
      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        {matrix.map(({ reqId, reqText, linked }, i) => (
          <motion.div
            key={reqId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            style={{
              padding: "14px 20px",
              borderBottom: i < matrix.length - 1 ? "1px solid var(--c-border)" : "none",
              background: linked.length === 0 ? "rgba(239,68,68,0.03)" : "transparent",
            }}
          >
            {/* Req header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                background: linked.length > 0 ? "#22C55E" : "#EF4444",
                boxShadow: `0 0 6px ${linked.length > 0 ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", fontWeight: 700, color: "var(--c-accent)" }}>
                    {reqId}
                  </span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                    {linked.length} test{linked.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{
                  fontSize: "0.75rem", color: "var(--c-text-3)", lineHeight: 1.45,
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                }}>
                  {reqText}
                </div>
              </div>
            </div>

            {/* Linked test cases */}
            {linked.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 18 }}>
                {linked.map(tc => (
                  <div
                    key={tc.test_id}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "3px 8px", borderRadius: "var(--r-full)",
                      background: "var(--c-surface-2)", border: "1px solid var(--c-border)",
                      fontSize: "0.6875rem",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--c-text-2)" }}>
                      {tc.test_id}
                    </span>
                    <AsilBadge asil={tc.asil} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ paddingLeft: 18, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span style={{ fontSize: "0.75rem", color: "#EF4444", fontWeight: 500 }}>
                  No test case generated
                </span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
