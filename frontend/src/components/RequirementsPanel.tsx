import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import type { UploadResult } from "../types";

interface Props {
  data: UploadResult;
  onGenerate: (requirements: string[]) => void;
  onBack: () => void;
}

export function RequirementsPanel({ data, onGenerate, onBack }: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(data.requirements.map((_, i) => i))
  );

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === data.requirements.length) setSelected(new Set());
    else setSelected(new Set(data.requirements.map((_, i) => i)));
  }

  const chosenRequirements = data.requirements.filter((_, i) => selected.has(i));
  const allSelected = selected.size === data.requirements.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680, width: "100%", margin: "0 auto" }}
    >
      {/* File header card */}
      <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.filename}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 2 }}>
            {data.requirement_count} requirements extracted · Select which to include
          </div>
        </div>
        <motion.button
          onClick={onBack}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn btn-ghost"
          style={{ fontSize: "0.8125rem", padding: "6px 12px", flexShrink: 0 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Change
        </motion.button>
      </div>

      {/* Requirements list */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", borderBottom: "1px solid var(--c-border)",
        }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)" }}>
            {selected.size} / {data.requirements.length} selected
          </span>
          <motion.button
            onClick={toggleAll}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              fontSize: "0.75rem", fontWeight: 600, color: "var(--c-accent)",
              background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font)",
            }}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </motion.button>
        </div>

        {/* List */}
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {data.requirements.map((req, i) => {
            const isSelected = selected.has(i);
            return (
              <motion.label
                key={i}
                whileHover={{ background: "var(--c-surface-2)" }}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 18px", cursor: "pointer",
                  borderBottom: i < data.requirements.length - 1 ? "1px solid var(--c-border)" : "none",
                  transition: "background var(--t-fast)",
                }}
              >
                {/* Custom checkbox */}
                <div
                  style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
                    border: `1.5px solid ${isSelected ? "var(--c-accent)" : "var(--c-border-2)"}`,
                    background: isSelected ? "var(--c-accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all var(--t-fast)",
                  }}
                  onClick={() => toggle(i)}
                >
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <input type="checkbox" checked={isSelected} onChange={() => toggle(i)} style={{ display: "none" }} />

                <span style={{ fontSize: "0.8125rem", color: isSelected ? "var(--c-text)" : "var(--c-text-3)", lineHeight: 1.55, transition: "color var(--t-fast)" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.6875rem",
                    color: "var(--c-text-3)", marginRight: 8,
                  }}>
                    #{String(i + 1).padStart(2, "0")}
                  </span>
                  {req}
                </span>
              </motion.label>
            );
          })}
        </div>
      </div>

      {/* Generate button */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <motion.button
              onClick={() => onGenerate(chosenRequirements)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "14px 24px", fontSize: "0.9375rem", fontWeight: 700 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Generate Test Cases for {selected.size} Requirement{selected.size !== 1 ? "s" : ""}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
