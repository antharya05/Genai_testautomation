import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  progress: number;
  currentReq: string;
  totalReqs: number;
  completedReqs: number;
  ragActive: boolean;
  phase: "queued" | "generating" | "validating" | "done";
}

const CORE_PULSES = [0, 0.15, 0.3];

function OrbitalDots({ radius, speed, dotCount, color, startDelay = 0 }: {
  radius: number; speed: number; dotCount: number; color: string; startDelay?: number;
}) {
  return (
    <>
      {Array.from({ length: dotCount }).map((_, i) => {
        const offset = (i / dotCount) * speed;
        return (
          <motion.div
            key={i}
            style={{
              position: "absolute",
              width: radius * 2,
              height: radius * 2,
              top: "50%",
              left: "50%",
              marginTop: -radius,
              marginLeft: -radius,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: speed, repeat: Infinity, ease: "linear", delay: startDelay - offset }}
          >
            <div style={{
              position: "absolute",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: color,
              top: -2.5,
              left: "50%",
              marginLeft: -2.5,
              boxShadow: `0 0 6px ${color}`,
            }} />
          </motion.div>
        );
      })}
    </>
  );
}

const PHASE_LABELS: Record<string, string> = {
  queued: "Initializing RAG Pipeline…",
  generating: "Generating Test Cases…",
  validating: "Validating & Deduplicating…",
  done: "Complete",
};

const TIPS = [
  "Retrieving relevant ASIL standards from knowledge base",
  "Applying ISO 26262 fault injection patterns",
  "Enriching prompts with automotive timing constraints",
  "Cross-referencing AUTOSAR safety mechanisms",
  "Applying boundary value analysis patterns",
  "Validating ASIL decomposition coverage",
];

const PHASES = ["queued", "generating", "validating", "done"] as const;

export function GeneratingScreen({ progress, currentReq, totalReqs, completedReqs, ragActive, phase }: Props) {
  const [tipIndex, setTipIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 3200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const pct = Math.min(100, Math.max(0, progress));
  const eta = pct > 0 ? Math.round((elapsed / pct) * (100 - pct)) : null;
  const currentPhaseIdx = PHASES.indexOf(phase);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        gap: 48,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="grid-bg" style={{ position: "absolute", inset: 0, opacity: 0.4 }} />

      {/* Orbital visualization */}
      <div style={{ position: "relative", width: 200, height: 200, flexShrink: 0 }}>
        {[56, 78, 96].map(r => (
          <div key={r} style={{
            position: "absolute",
            width: r * 2, height: r * 2,
            top: "50%", left: "50%",
            marginTop: -r, marginLeft: -r,
            borderRadius: "50%",
            border: "1px solid rgba(99,102,241,0.12)",
          }} />
        ))}

        <OrbitalDots radius={56} speed={4} dotCount={3} color="rgba(99,102,241,0.9)" />
        <OrbitalDots radius={78} speed={6.5} dotCount={5} color="rgba(139,92,246,0.7)" startDelay={0.5} />
        <OrbitalDots radius={96} speed={9} dotCount={7} color="rgba(6,182,212,0.5)" startDelay={1} />

        {CORE_PULSES.map((delay, i) => (
          <motion.div
            key={i}
            style={{
              position: "absolute", inset: 0, margin: "auto",
              width: 36, height: 36, borderRadius: "50%",
              border: "1px solid rgba(99,102,241,0.4)",
            }}
            animate={{ scale: [1, 2.8, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, delay, ease: "easeOut" }}
          />
        ))}

        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: 0, margin: "auto",
            width: 40, height: 40, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--c-accent), var(--c-accent-2))",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 24px var(--c-accent-glow), 0 0 48px var(--c-accent-glow)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </motion.div>
      </div>

      {/* Status card */}
      <div style={{ width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <AnimatePresence mode="wait">
            <motion.h2
              key={phase}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--c-text)", margin: 0 }}
            >
              {PHASE_LABELS[phase]}
            </motion.h2>
          </AnimatePresence>
          {currentReq && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ fontSize: "0.8125rem", color: "var(--c-text-3)", marginTop: 6, lineHeight: 1.5 }}
            >
              Processing:{" "}
              <span style={{ color: "var(--c-text-2)" }}>
                {currentReq.length > 72 ? `${currentReq.slice(0, 72)}…` : currentReq}
              </span>
            </motion.p>
          )}
        </div>

        {/* Progress */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>
              {completedReqs} / {totalReqs} requirements
            </span>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--c-accent)" }}>
              {pct.toFixed(0)}%
            </span>
          </div>
          <div className="progress-track">
            <motion.div
              className="progress-fill"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          {eta !== null && eta > 0 && (
            <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 6, textAlign: "right" }}>
              ~{eta}s remaining · {elapsed}s elapsed
            </div>
          )}
        </div>

        {/* Phase stepper */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
          {PHASES.map((p, i) => {
            const done = i < currentPhaseIdx;
            const active = i === currentPhaseIdx;
            return (
              <div key={p} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  <motion.div
                    animate={{
                      background: active ? "var(--c-accent)" : done ? "#22C55E" : "var(--c-border-2)",
                      scale: active ? 1.25 : 1,
                    }}
                    style={{ width: 8, height: 8, borderRadius: "50%" }}
                  />
                  <span style={{
                    fontSize: "0.625rem",
                    color: active ? "var(--c-accent)" : done ? "#22C55E" : "var(--c-text-3)",
                    fontWeight: active ? 600 : 400,
                    whiteSpace: "nowrap",
                  }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </span>
                </div>
                {i < PHASES.length - 1 && (
                  <div style={{
                    width: 36, height: 1, marginBottom: 14, flexShrink: 0,
                    background: done ? "#22C55E" : "var(--c-border-2)",
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* RAG indicator */}
        <AnimatePresence>
          {ragActive && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: "var(--r-md)",
                background: "rgba(99,102,241,0.06)",
                border: "1px solid rgba(99,102,241,0.2)",
              }}
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-accent)", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--c-accent)" }}>
                  RAG Pipeline Active
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tipIndex}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.2 }}
                    style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 2 }}
                  >
                    {TIPS[tipIndex]}
                  </motion.div>
                </AnimatePresence>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
