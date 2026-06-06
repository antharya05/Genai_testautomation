import type { ASIL, TestType } from "../../types";

export function AsilBadge({ asil }: { asil: ASIL }) {
  return (
    <span
      className="badge"
      style={{
        background: `var(--asil-${asil.toLowerCase()}-bg)`,
        color: `var(--asil-${asil.toLowerCase()}-text)`,
        borderColor: `var(--asil-${asil.toLowerCase()}-ring)`,
      }}
    >
      {asil === "QM" ? "QM" : `ASIL ${asil}`}
    </span>
  );
}

const TYPE_COLORS: Record<TestType, { bg: string; text: string; border: string }> = {
  functional:     { bg: "rgba(99,102,241,0.08)",  text: "#6366F1", border: "rgba(99,102,241,0.25)"  },
  boundary:       { bg: "rgba(139,92,246,0.08)",  text: "#8B5CF6", border: "rgba(139,92,246,0.25)"  },
  negative:       { bg: "rgba(244,63,94,0.08)",   text: "#F43F5E", border: "rgba(244,63,94,0.25)"   },
  fault_injection:{ bg: "rgba(239,68,68,0.08)",   text: "#EF4444", border: "rgba(239,68,68,0.25)"   },
  timing:         { bg: "rgba(6,182,212,0.08)",   text: "#06B6D4", border: "rgba(6,182,212,0.25)"   },
  safety:         { bg: "rgba(245,158,11,0.08)",  text: "#F59E0B", border: "rgba(245,158,11,0.25)"  },
  recovery:       { bg: "rgba(20,184,166,0.08)",  text: "#14B8A6", border: "rgba(20,184,166,0.25)"  },
  stress:         { bg: "rgba(236,72,153,0.08)",  text: "#EC4899", border: "rgba(236,72,153,0.25)"  },
};

export function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type as TestType] ?? { bg: "var(--c-bg-2)", text: "var(--c-text-2)", border: "var(--c-border-2)" };
  return (
    <span className="badge" style={{ background: c.bg, color: c.text, borderColor: c.border }}>
      {type.replace(/_/g, " ")}
    </span>
  );
}
