import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { DEMO_SCENARIOS } from "../../data/demos";
import type { DemoScenario, UploadResult } from "../../types";

interface Props {
  onLoad: (data: UploadResult) => void;
}

const ASIL_COLORS: Record<string, string> = {
  D: "#EF4444",
  C: "#F59E0B",
  B: "#6366F1",
  A: "#22C55E",
};

export function DemoLoader({ onLoad }: Props) {
  const [open, setOpen] = useState(false);

  function load(scenario: DemoScenario) {
    setOpen(false);
    onLoad({
      filename: `${scenario.id}.txt`,
      extracted_text: scenario.requirements.join("\n\n"),
      requirements: scenario.requirements,
      requirement_count: scenario.requirements.length,
    });
  }

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 16px",
          borderRadius: "var(--r-md)",
          border: "1px dashed var(--c-border-2)",
          background: "transparent",
          color: "var(--c-text-3)",
          fontSize: "0.8125rem", fontWeight: 500,
          cursor: "pointer", fontFamily: "var(--font)",
          transition: "all var(--t-fast)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--c-accent)";
          e.currentTarget.style.color = "var(--c-accent)";
          e.currentTarget.style.background = "rgba(99,102,241,0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--c-border-2)";
          e.currentTarget.style.color = "var(--c-text-3)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Load Demo Scenario
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                zIndex: 100, backdropFilter: "blur(4px)",
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "fixed", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 101,
                width: "100%", maxWidth: 480,
                margin: "0 16px",
              }}
            >
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--c-border)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--c-text)" }}>
                      Demo Scenarios
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 2 }}>
                      Pre-loaded automotive requirements — no upload needed
                    </div>
                  </div>
                  <motion.button
                    onClick={() => setOpen(false)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="btn-icon"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </motion.button>
                </div>

                {/* Scenarios */}
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {DEMO_SCENARIOS.map((s, i) => (
                    <motion.button
                      key={s.id}
                      onClick={() => load(s)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      whileHover={{ x: 3 }}
                      whileTap={{ scale: 0.99 }}
                      style={{
                        width: "100%", textAlign: "left",
                        padding: "14px 16px",
                        borderRadius: "var(--r-md)",
                        border: "1px solid var(--c-border)",
                        background: "var(--c-surface-2)",
                        cursor: "pointer", fontFamily: "var(--font)",
                        display: "flex", alignItems: "flex-start", gap: 14,
                        transition: "all var(--t-fast)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--c-accent)";
                        e.currentTarget.style.background = "rgba(99,102,241,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--c-border)";
                        e.currentTarget.style.background = "var(--c-surface-2)";
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: "var(--c-surface)",
                        border: "1px solid var(--c-border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "1.25rem",
                      }}>
                        {s.icon}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>
                            {s.name}
                          </span>
                          {s.asilLevel && (
                            <span style={{
                              fontSize: "0.625rem", fontWeight: 700,
                              padding: "1px 6px", borderRadius: "var(--r-full)",
                              background: `${ASIL_COLORS[s.asilLevel]}18`,
                              color: ASIL_COLORS[s.asilLevel],
                              border: `1px solid ${ASIL_COLORS[s.asilLevel]}40`,
                            }}>
                              ASIL-{s.asilLevel}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", lineHeight: 1.4 }}>
                          {s.description}
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 4, opacity: 0.7 }}>
                          {s.requirements.length} requirements
                        </div>
                      </div>

                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
