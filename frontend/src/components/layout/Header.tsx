import { motion } from "framer-motion";
import { useState } from "react";
import { CommandPalette } from "../ui/CommandPalette";

interface Props {
  phase: string;
  testCount: number;
  onReset: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

const LABELS: Record<string, string> = {
  upload: "Document Upload",
  review: "Requirements Review",
  generating: "Generating Test Cases",
  results: "Test Case Review",
};

export function Header({ phase, testCount, onReset, darkMode, onToggleDark }: Props) {
  const [cmdOpen, setCmdOpen] = useState(false);

  // Global keyboard shortcut
  if (typeof window !== "undefined") {
    window.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(v => !v);
      }
    };
  }

  return (
    <>
      <header style={{
        height: 52, borderBottom: "1px solid var(--c-border)",
        background: "var(--c-surface)", display: "flex", alignItems: "center",
        padding: "0 20px", gap: 12, flexShrink: 0, position: "sticky", top: 0, zIndex: 40,
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", fontWeight: 500 }}>AutoTest AI</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>
            {LABELS[phase] ?? "Dashboard"}
          </span>
          {phase === "results" && testCount > 0 && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{
                background: "var(--c-accent-dim)", color: "var(--c-accent)",
                fontSize: "0.6875rem", fontWeight: 700, padding: "2px 8px",
                borderRadius: "var(--r-full)", border: "1px solid var(--c-accent-glow)",
              }}
            >
              {testCount} cases
            </motion.span>
          )}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Command palette trigger */}
          <motion.button
            onClick={() => setCmdOpen(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 10px", borderRadius: "var(--r-md)",
              background: "var(--c-surface-2)", border: "1px solid var(--c-border-2)",
              color: "var(--c-text-3)", cursor: "pointer", fontSize: "0.75rem",
              fontFamily: "var(--font)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>Search</span>
            <span style={{
              display: "flex", alignItems: "center", gap: 2,
              padding: "1px 5px", borderRadius: 4, background: "var(--c-border-2)",
              fontSize: "0.625rem", fontWeight: 700, fontFamily: "var(--font-mono)",
              color: "var(--c-text-3)", letterSpacing: "0.02em",
            }}>
              ⌘K
            </span>
          </motion.button>

          {/* Dark mode toggle */}
          <motion.button
            onClick={onToggleDark}
            whileHover={{ scale: 1.1, rotate: 15 }}
            whileTap={{ scale: 0.9 }}
            className="btn-icon"
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            <motion.span
              key={darkMode ? "sun" : "moon"}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {darkMode ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </motion.span>
          </motion.button>

          {/* New document */}
          {phase !== "upload" && (
            <motion.button
              onClick={onReset}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="btn btn-ghost"
              style={{ fontSize: "0.8125rem", padding: "6px 12px" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              New Document
            </motion.button>
          )}
        </div>
      </header>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onReset={onReset} phase={phase} />
    </>
  );
}
