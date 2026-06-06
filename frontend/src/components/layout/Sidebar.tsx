import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

type AppPhase = "upload" | "review" | "generating" | "results";

interface Props {
  phase: string;
  onNavigate: (phase: AppPhase) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const NAV = [
  {
    id: "upload", label: "New Document", phases: ["upload", "review", "generating", "results"],
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
  },
  {
    id: "results", label: "Review Workspace", phases: ["results"],
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
    ),
  },
];

const sidebarVariants = {
  expanded: { width: 240 },
  collapsed: { width: 64 },
};

export function Sidebar({ phase, onNavigate, onCollapsedChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    onCollapsedChange?.(next);
  }

  return (
    <motion.aside
      variants={sidebarVariants}
      animate={collapsed ? "collapsed" : "expanded"}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "fixed", left: 0, top: 0, height: "100vh", zIndex: 50,
        background: "var(--c-surface)", borderRight: "1px solid var(--c-border)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <motion.div
          whileHover={{ scale: 1.05 }}
          style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: "linear-gradient(135deg, var(--c-accent), var(--c-accent-2))",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px var(--c-accent-glow)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </motion.div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden", whiteSpace: "nowrap" }}
            >
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--c-text)", lineHeight: 1.2 }}>AutoTest AI</div>
              <div style={{ fontSize: "0.625rem", color: "var(--c-text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 1 }}>ISO 26262</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav items */}
      <nav style={{ padding: "0 8px", flex: 1 }}>
        {NAV.map(({ id, label, icon, phases }) => {
          const active = phase === id || (id === "results" && phase === "results");
          const available = phases.includes(phase);
          return (
            <motion.button
              key={id}
              onClick={() => available && onNavigate(id as AppPhase)}
              disabled={!available}
              whileHover={available ? { x: 2 } : {}}
              whileTap={available ? { scale: 0.97 } : {}}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 10px", borderRadius: "var(--r-md)", border: "none", cursor: available ? "pointer" : "not-allowed",
                marginBottom: 2, outline: "none", fontFamily: "var(--font)",
                background: active ? "var(--c-accent-dim)" : "transparent",
                color: active ? "var(--c-accent)" : available ? "var(--c-text-2)" : "var(--c-text-3)",
                transition: "all var(--t-fast)",
                textAlign: "left",
              }}
            >
              <span style={{ width: 16, height: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {icon}
              </span>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    style={{ fontSize: "0.8125rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden" }}
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
              {active && (
                <motion.div
                  layoutId="sidebar-indicator"
                  style={{ marginLeft: "auto", width: 4, height: 4, borderRadius: 2, background: "var(--c-accent)", flexShrink: 0 }}
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid var(--c-border)" }}>
        <motion.button
          onClick={toggleCollapsed}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-end",
            padding: "7px 10px", borderRadius: "var(--r-md)", border: "none",
            background: "transparent", color: "var(--c-text-3)", cursor: "pointer",
            transition: "all var(--t-fast)",
          }}
        >
          <motion.svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.25 }}
          >
            <polyline points="15 18 9 12 15 6"/>
          </motion.svg>
        </motion.button>
      </div>
    </motion.aside>
  );
}
