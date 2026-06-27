import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FileText,
  Gauge,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Tag,
  Timer,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCatalogDetail,
  getCoverageSummary,
  getProjectRequirements,
  getRequirementDetail,
  reviseRequirement,
} from "../../api/client";
import { PageTransition } from "../../components/layout/PageTransition";
import { useProject } from "../../context/ProjectContext";
import type {
  CatalogDetail,
  CoverageStatus,
  CoverageSummary,
  FailureType,
  GenerationStatus,
  RequirementDetail,
  RequirementImpact,
  RequirementOverview,
} from "../../types";

// ─── Design tokens ──────────────────────────────────────────────────────────────

const ASIL_COLORS: Record<string, string> = {
  QM: "#94a3b8", A: "#10b981", B: "#f59e0b", C: "#f97316", D: "#ef4444",
};

const COVERAGE: Record<CoverageStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  covered:   { label: "Covered",   color: "#10b981", Icon: CheckCircle2 },
  partial:   { label: "Partial",   color: "#f59e0b", Icon: AlertTriangle },
  uncovered: { label: "Uncovered", color: "#ef4444", Icon: XCircle },
};

// Generation outcome — a separate axis from coverage. "Failed" is never shown as
// "Uncovered": the user sees the requirement failed and (via the chip) why.
const GENERATION: Record<GenerationStatus, { label: string; color: string }> = {
  generated:         { label: "Generated",     color: "#10b981" },
  generation_failed: { label: "Failed",        color: "#f87171" },
  pending:           { label: "Pending",       color: "#f59e0b" },
  in_progress:       { label: "In Progress",   color: "#60a5fa" },
  not_generated:     { label: "Not Generated", color: "#94a3b8" },
};

// User-facing failure-reason chips.
const FAILURE_LABEL: Record<FailureType, string> = {
  rate_limit:           "Rate Limited",
  timeout:              "Timeout",
  malformed_response:   "Invalid Response",
  validation_failure:   "Validation Failed",
  parsing_failure:      "Parse Failed",
  provider_unavailable: "Provider Offline",
  unknown:              "Error",
};

const TYPE_COLORS: Record<string, string> = {
  functional: "#818cf8", boundary: "#34d399", negative: "#f87171",
  fault_injection: "#fb923c", timing: "#60a5fa", safety: "#a78bfa",
  recovery: "#4ade80", stress: "#f472b6",
};

function qualityColor(score: number | null): string {
  if (score === null || score === undefined) return "#94a3b8";
  if (score >= 90) return "#10b981";
  if (score >= 70) return "#34d399";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Coverage dot ─────────────────────────────────────────────────────────────

function CoverageDot({ status }: { status: CoverageStatus }) {
  const cfg = COVERAGE[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 9, height: 9, borderRadius: "50%", background: cfg.color, flexShrink: 0,
        boxShadow: `0 0 0 3px ${cfg.color}22`,
      }} />
      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
    </span>
  );
}

// ─── Generation status badge ──────────────────────────────────────────────────

function GenerationBadge({
  status, failureType, failureReason,
}: { status: GenerationStatus; failureType: FailureType | null; failureReason: string | null }) {
  const g = GENERATION[status] ?? GENERATION.not_generated;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{
        fontSize: "0.6875rem", fontWeight: 700, padding: "2px 8px", borderRadius: 5,
        background: g.color + "1a", color: g.color, border: `1px solid ${g.color}40`, whiteSpace: "nowrap",
      }}>
        {g.label}
      </span>
      {status === "generation_failed" && failureType && (
        <span
          title={failureReason ?? undefined}
          style={{
            fontSize: "0.6875rem", fontWeight: 600, padding: "2px 8px", borderRadius: 5,
            background: "#f8717115", color: "#f87171", border: "1px solid #f8717133", whiteSpace: "nowrap",
          }}
        >
          {FAILURE_LABEL[failureType]}
        </span>
      )}
    </span>
  );
}

// ─── Summary cards ──────────────────────────────────────────────────────────────

function SummaryCards({ summary, isMobile }: { summary: CoverageSummary; isMobile: boolean }) {
  const cards = [
    { label: "Total Requirements", value: summary.total, color: "#818cf8", Icon: FileText },
    { label: "Covered", value: summary.covered, color: "#10b981", Icon: CheckCircle2 },
    { label: "Uncovered", value: summary.uncovered, color: "#ef4444", Icon: XCircle },
    { label: "Coverage", value: `${summary.coverage_pct}%`, color: "#34d399", Icon: Gauge },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
      {cards.map((c) => (
        <div key={c.label} style={{
          background: "var(--c-surface)", border: "1px solid var(--c-border)",
          borderRadius: 12, padding: "14px 18px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <c.Icon size={13} color={c.color} strokeWidth={2.2} />
            <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-text-3)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {c.label}
            </span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: c.color, letterSpacing: "-0.03em", lineHeight: 1 }}>
            {typeof c.value === "number" ? c.value.toLocaleString() : c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Coverage progress bar ─────────────────────────────────────────────────────

function CoverageBar({ summary }: { summary: CoverageSummary }) {
  const total = summary.total || 1;
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", background: "var(--c-bg-2)", border: "1px solid var(--c-border)" }}>
        <div style={{ width: seg(summary.covered), background: COVERAGE.covered.color }} />
        <div style={{ width: seg(summary.partially_covered), background: COVERAGE.partial.color }} />
        <div style={{ width: seg(summary.uncovered), background: COVERAGE.uncovered.color }} />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        <Legend color={COVERAGE.covered.color} label={`${summary.covered} covered`} />
        <Legend color={COVERAGE.partial.color} label={`${summary.partially_covered} partial`} />
        <Legend color={COVERAGE.uncovered.color} label={`${summary.uncovered} uncovered`} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "var(--c-text-3)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

// ─── Requirement table row ──────────────────────────────────────────────────────

function RequirementRow({ req, onSelect, index }: { req: RequirementOverview; onSelect: () => void; index: number }) {
  const asilColor = ASIL_COLORS[req.asil] ?? "#94a3b8";
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      onClick={onSelect}
      style={{ cursor: "pointer", borderBottom: "1px solid var(--c-border)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--c-bg-2)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: "0.75rem", color: "var(--c-text-2)", whiteSpace: "nowrap" }}>
        {req.requirement_id}
      </td>
      <td style={{ padding: "12px 14px", fontSize: "0.8125rem", color: "var(--c-text)", maxWidth: 420 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.45 }}>
          {req.statement}
        </div>
      </td>
      <td style={{ padding: "12px 14px", textAlign: "center" }}>
        <span style={{
          fontSize: "0.6875rem", fontWeight: 700, padding: "2px 8px", borderRadius: 5,
          background: asilColor + "20", color: asilColor, border: `1px solid ${asilColor}40`,
        }}>
          {req.asil}
        </span>
      </td>
      <td style={{ padding: "12px 14px", textAlign: "center" }}>
        {req.quality_score === null ? (
          <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>—</span>
        ) : (
          <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: qualityColor(req.quality_score) }}>
            {req.quality_score}
          </span>
        )}
      </td>
      <td style={{ padding: "12px 14px" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--c-text-2)" }}>{titleCase(req.category)}</span>
      </td>
      <td style={{ padding: "12px 14px", textAlign: "center", fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text-2)" }}>
        {req.coverage_count}
      </td>
      <td style={{ padding: "12px 14px" }}>
        <CoverageDot status={req.coverage_status} />
      </td>
      <td style={{ padding: "12px 14px" }}>
        <GenerationBadge
          status={req.generation_status}
          failureType={req.failure_type}
          failureReason={req.failure_reason}
        />
      </td>
    </motion.tr>
  );
}

// ─── Detail drawer ──────────────────────────────────────────────────────────────

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: "0.6875rem", fontWeight: 600, padding: "3px 9px", borderRadius: 6,
      background: color + "18", color, border: `1px solid ${color}33`, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Gauge; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Icon size={14} color="var(--c-text-3)" strokeWidth={2} />
        <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-text-3)" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function DetailDrawer({ projectId, reqKey, onClose }: { projectId: string; reqKey: string; onClose: () => void }) {
  const [detail, setDetail] = useState<RequirementDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRequirementDetail(projectId, reqKey)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, reqKey]);

  const cov = detail ? COVERAGE[detail.coverage_status] : COVERAGE.uncovered;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }}
      />
      {/* Panel */}
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
          width: "min(560px, 100vw)", background: "var(--c-surface)",
          borderLeft: "1px solid var(--c-border)", boxShadow: "-24px 0 64px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--c-accent)", marginBottom: 4 }}>
              {detail?.requirement_id ?? reqKey}
            </div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--c-text)", lineHeight: 1.4 }}>
              {detail?.title ?? "Requirement Detail"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: "1px solid var(--c-border)", background: "var(--c-bg)", color: "var(--c-text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
              <Loader2 size={22} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : !detail || detail.error ? (
            <div style={{ color: "var(--c-text-3)", fontSize: "0.875rem", textAlign: "center", padding: "40px 0" }}>
              Could not load requirement detail.
            </div>
          ) : (
            <>
              {/* Status chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                <Pill color={ASIL_COLORS[detail.asil] ?? "#94a3b8"}>ASIL {detail.asil}</Pill>
                <Pill color="#818cf8">{titleCase(detail.category)}</Pill>
                <Pill color={cov.color}>{cov.label} · {detail.coverage_count} cases</Pill>
                <GenerationBadge
                  status={detail.generation_status}
                  failureType={detail.failure_type}
                  failureReason={detail.failure_reason}
                />
                {detail.asil_source === "estimated" && (
                  <Pill color="#94a3b8">ASIL estimated ({detail.asil_confidence}%)</Pill>
                )}
              </div>

              {/* Generation failure callout — explains why there are no cases */}
              {detail.generation_status === "generation_failed" && (
                <div style={{
                  display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20,
                  padding: "12px 14px", borderRadius: 10,
                  background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                }}>
                  <AlertCircle size={15} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#f87171", marginBottom: 2 }}>
                      Generation failed{detail.failure_type ? ` · ${FAILURE_LABEL[detail.failure_type]}` : ""}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--c-text-2)", lineHeight: 1.5 }}>
                      {detail.failure_reason || "This requirement was submitted but produced no test cases. Re-run generation to retry."}
                      {detail.last_attempt_at && (
                        <span style={{ color: "var(--c-text-3)" }}> · last attempt {new Date(detail.last_attempt_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Full statement */}
              <Section icon={FileText} title="Statement">
                <p style={{ fontSize: "0.875rem", color: "var(--c-text)", lineHeight: 1.6, margin: 0 }}>
                  {detail.statement}
                </p>
                {detail.description && (
                  <p style={{ fontSize: "0.8125rem", color: "var(--c-text-2)", lineHeight: 1.6, marginTop: 10 }}>
                    {detail.description}
                  </p>
                )}
                {(detail.area || detail.test_focus) && (
                  <div style={{ marginTop: 10, fontSize: "0.75rem", color: "var(--c-text-3)", display: "flex", flexDirection: "column", gap: 3 }}>
                    {detail.area && <span><strong style={{ color: "var(--c-text-2)" }}>Area:</strong> {detail.area}</span>}
                    {detail.test_focus && <span><strong style={{ color: "var(--c-text-2)" }}>Test focus:</strong> {detail.test_focus}</span>}
                  </div>
                )}
              </Section>

              {/* Version history + revise (Phase 4) */}
              <VersionHistorySection projectId={projectId} reqKey={detail.requirement_id ?? reqKey} statement={detail.statement} />

              {/* Quality analysis */}
              {detail.quality && (
                <Section icon={Gauge} title="Quality Analysis">
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                      background: qualityColor(detail.quality.quality_score) + "18",
                      border: `1px solid ${qualityColor(detail.quality.quality_score)}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "1.25rem", fontWeight: 800, color: qualityColor(detail.quality.quality_score),
                    }}>
                      {detail.quality.quality_score}
                    </div>
                    <div>
                      <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: qualityColor(detail.quality.quality_score) }}>
                        {detail.quality.quality_level}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>Requirement quality score / 100</div>
                    </div>
                  </div>
                  <FindingList items={detail.quality.issues} color="#ef4444" Icon={AlertCircle} label="Issues" />
                  <FindingList items={detail.quality.warnings} color="#f59e0b" Icon={AlertTriangle} label="Warnings" />
                  <FindingList items={detail.quality.strengths} color="#10b981" Icon={CheckCircle2} label="Strengths" />
                </Section>
              )}

              {/* Thresholds & timing */}
              {(detail.thresholds.length > 0 || detail.timing_constraints.length > 0 || detail.units.length > 0) && (
                <Section icon={Timer} title="Thresholds & Timing">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detail.thresholds.length > 0 && <ChipRow label="Thresholds" items={detail.thresholds} color="#60a5fa" />}
                    {detail.timing_constraints.length > 0 && <ChipRow label="Timing" items={detail.timing_constraints} color="#a78bfa" />}
                    {detail.units.length > 0 && <ChipRow label="Units" items={detail.units} color="#34d399" />}
                    {detail.logical_operators.length > 0 && <ChipRow label="Logic" items={detail.logical_operators} color="#f472b6" />}
                  </div>
                </Section>
              )}

              {/* Entities */}
              {detail.entities.length > 0 && (
                <Section icon={Tag} title="Entities & Signals">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {detail.entities.map((e) => (
                      <span key={e} style={{ fontSize: "0.6875rem", fontFamily: "monospace", padding: "3px 8px", borderRadius: 5, background: "var(--c-bg-2)", border: "1px solid var(--c-border)", color: "var(--c-text-2)" }}>
                        {e}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Linked test cases */}
              <Section icon={Layers} title={`Linked Test Cases (${detail.linked_test_cases.length})`}>
                {detail.linked_test_cases.length === 0 ? (
                  <div style={{
                    border: "1px dashed var(--c-border)", borderRadius: 10, padding: "18px",
                    textAlign: "center", fontSize: "0.8125rem", color: "var(--c-text-3)",
                  }}>
                    No test cases generated for this requirement yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {detail.linked_test_cases.map((tc) => {
                      const tcolor = TYPE_COLORS[tc.test_type] ?? "#818cf8";
                      return (
                        <div key={tc.test_id} style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", borderRadius: 10, padding: "10px 13px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                            <span style={{ fontFamily: "monospace", fontSize: "0.6875rem", color: "var(--c-text-3)", paddingTop: 2, flexShrink: 0 }}>{tc.test_id}</span>
                            <span style={{ flex: 1, fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-text)", lineHeight: 1.4 }}>{tc.title}</span>
                            <Pill color={tcolor}>{tc.test_type.replace("_", " ")}</Pill>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}

function FindingList({ items, color, Icon, label }: { items: string[]; color: string; Icon: typeof AlertCircle; label: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: "0.6875rem", fontWeight: 700, color, marginBottom: 5, display: "flex", alignItems: "center", gap: 5 }}>
        <Icon size={12} /> {label} ({items.length})
      </div>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: "0.75rem", color: "var(--c-text-2)", lineHeight: 1.5, paddingLeft: 14, position: "relative" }}>
            <span style={{ position: "absolute", left: 2, top: 6, width: 4, height: 4, borderRadius: "50%", background: color }} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChipRow({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-text-3)", minWidth: 64 }}>{label}</span>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {items.map((it, i) => <Pill key={i} color={color}>{it}</Pill>)}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FilterKey = CoverageStatus | "all" | "failed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "covered", label: "Covered" },
  { key: "partial", label: "Partial" },
  { key: "uncovered", label: "Uncovered" },
  { key: "failed", label: "Failed" },
];

export default function RequirementsPage() {
  const { selectedProject } = useProject();
  const [requirements, setRequirements] = useState<RequirementOverview[]>([]);
  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  async function load() {
    if (!selectedProject) return;
    setLoading(true);
    setError(null);
    try {
      const [reqs, cov] = await Promise.all([
        getProjectRequirements(selectedProject.id),
        getCoverageSummary(selectedProject.id),
      ]);
      setRequirements(reqs);
      setSummary(cov);
    } catch {
      setError("Could not load requirements. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedProject]);

  const counts = useMemo(() => ({
    all: requirements.length,
    covered: requirements.filter((r) => r.coverage_status === "covered").length,
    partial: requirements.filter((r) => r.coverage_status === "partial").length,
    uncovered: requirements.filter((r) => r.coverage_status === "uncovered").length,
    failed: requirements.filter((r) => r.generation_status === "generation_failed").length,
  }), [requirements]);

  const filtered =
    filter === "all"
      ? requirements
      : filter === "failed"
        ? requirements.filter((r) => r.generation_status === "generation_failed")
        : requirements.filter((r) => r.coverage_status === filter);

  return (
    <PageTransition>
      <div style={{ padding: "36px 40px", maxWidth: 1200 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.22)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <FileText size={17} color="#818cf8" strokeWidth={1.75} />
              </div>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>
                Requirements
              </h1>
            </div>
            <p style={{ color: "var(--c-text-2)", fontSize: "0.875rem", margin: 0 }}>
              Requirement intelligence & coverage for {selectedProject?.name ?? "—"}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8,
              background: "var(--c-surface)", border: "1px solid var(--c-border)",
              color: "var(--c-text-2)", fontSize: "0.8125rem", fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={13} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
            Refresh
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={24} color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <AlertCircle size={16} color="#f87171" />
            <span style={{ color: "#f87171", fontSize: "0.875rem" }}>{error}</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && requirements.length === 0 && (
          <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 14, padding: "48px 32px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, marginBottom: 4, background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CircleDashed size={22} color="#818cf8" strokeWidth={1.75} />
            </div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--c-text)", margin: 0 }}>No requirements yet</h3>
            <p style={{ color: "var(--c-text-3)", fontSize: "0.875rem", margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
              Generate test cases from a requirements document and they will appear here with quality scores, ASIL, and live coverage.
            </p>
            <Link to="/app/generate" style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 8, background: "var(--c-accent-dim)", border: "1px solid var(--c-accent-glow)", color: "var(--c-accent)", textDecoration: "none", fontSize: "0.8125rem", fontWeight: 600 }}>
              <Sparkles size={14} /> Generate test cases
            </Link>
          </div>
        )}

        {/* Content */}
        {!loading && !error && requirements.length > 0 && summary && (
          <>
            <SummaryCards summary={summary} isMobile={isMobile} />
            <CoverageBar summary={summary} />

            {/* Generation-failure banner — failures are visible, never silent */}
            {counts.failed > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
                padding: "12px 16px", borderRadius: 10,
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
              }}>
                <AlertTriangle size={16} color="#f87171" />
                <span style={{ fontSize: "0.8125rem", color: "var(--c-text-2)" }}>
                  <strong style={{ color: "#f87171" }}>{counts.failed}</strong> requirement{counts.failed === 1 ? "" : "s"} failed
                  generation and produced no test cases. These are <em>not</em> uncovered — re-run generation to retry.
                </span>
                <button
                  onClick={() => setFilter("failed")}
                  style={{
                    marginLeft: "auto", padding: "5px 12px", borderRadius: 7, cursor: "pointer",
                    fontSize: "0.75rem", fontWeight: 600, border: "1px solid #f8717140",
                    background: "#f8717115", color: "#f87171", whiteSpace: "nowrap",
                  }}
                >
                  View failed
                </button>
              </div>
            )}

            {/* Filter bar */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const n = counts[f.key];
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    style={{
                      padding: "6px 13px", borderRadius: 8, cursor: "pointer",
                      fontSize: "0.75rem", fontWeight: 600,
                      border: `1px solid ${active ? "var(--c-accent)" : "var(--c-border)"}`,
                      background: active ? "var(--c-accent-dim)" : "var(--c-surface)",
                      color: active ? "var(--c-accent)" : "var(--c-text-2)",
                    }}
                  >
                    {f.label} <span style={{ opacity: 0.7 }}>({n})</span>
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-bg-2)" }}>
                      {["Requirement ID", "Statement", "ASIL", "Quality", "Category", "Cases", "Coverage", "Generation"].map((h, i) => (
                        <th key={h} style={{
                          padding: "11px 14px", fontSize: "0.6875rem", fontWeight: 700,
                          letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--c-text-3)",
                          textAlign: i === 2 || i === 3 || i === 5 ? "center" : "left", whiteSpace: "nowrap",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((req, i) => (
                      <RequirementRow key={req.key} req={req} index={i} onSelect={() => setSelectedKey(req.key)} />
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && (
                <div style={{ padding: "32px", textAlign: "center", fontSize: "0.875rem", color: "var(--c-text-3)" }}>
                  No {filter} requirements.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selectedKey && selectedProject && (
          <DetailDrawer
            projectId={selectedProject.id}
            reqKey={selectedKey}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}

// ─── Version history + revise (Phase 4) ───────────────────────────────────────

const CHANGE_CLASS_COLOR: Record<string, string> = {
  editorial: "#94a3b8", minor: "#60a5fa", major: "#f59e0b",
};

function VersionHistorySection({ projectId, reqKey, statement }: { projectId: string; reqKey: string; statement?: string | null }) {
  const [cat, setCat] = useState<CatalogDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const [cls, setCls] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<RequirementImpact | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try { setCat(await getCatalogDetail(projectId, reqKey)); }
    catch { setCat(null); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId, reqKey]);

  function startRevise() {
    setDraft(cat?.statement ?? statement ?? "");
    setReason(""); setCls("auto"); setImpact(null); setErr(null); setOpen(true);
  }

  async function submit() {
    if (!draft.trim()) return;
    setBusy(true); setErr(null);
    try {
      const res = await reviseRequirement(projectId, reqKey, {
        statement: draft.trim(),
        change_reason: reason.trim() || undefined,
        change_class: cls === "auto" ? undefined : cls,
      });
      if (res.error) { setErr(res.error); }
      else { setImpact(res.impact ?? null); setOpen(false); await load(); }
    } catch { setErr("Revise failed"); }
    finally { setBusy(false); }
  }

  if (!cat) return null;

  return (
    <Section icon={Layers} title="Version History">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "rgba(129,140,248,0.12)", color: "#818cf8" }}>
          current v{cat.current_version_no ?? 1}
        </span>
        <button onClick={open ? () => setOpen(false) : startRevise}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: "0.72rem", fontWeight: 600, background: "var(--c-bg-2)", border: "1px solid var(--c-border)", color: "var(--c-text-2)", fontFamily: "var(--font)" }}>
          <RefreshCw size={11} /> {open ? "Cancel" : "Revise"}
        </button>
      </div>

      {impact && (
        <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", fontSize: "0.75rem", color: "#f59e0b" }}>
          New version created · impact: {impact.affected_run_count} run(s), {impact.approved_run_count} approval(s), {impact.affected_test_cases} test case(s) affected.
        </div>
      )}

      {open && (
        <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder="Revised statement…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontSize: "0.8rem", fontFamily: "var(--font)", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Change reason"
              style={{ flex: 1, padding: "6px 10px", borderRadius: 7, background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontSize: "0.78rem", fontFamily: "var(--font)" }} />
            <select value={cls} onChange={e => setCls(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 7, background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontSize: "0.78rem", fontFamily: "var(--font)", cursor: "pointer" }}>
              <option value="auto">Auto-classify</option>
              <option value="editorial">Editorial</option>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
            </select>
            <button onClick={submit} disabled={busy || !draft.trim()}
              style={{ padding: "6px 14px", borderRadius: 7, cursor: busy ? "not-allowed" : "pointer", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", fontWeight: 600, fontFamily: "var(--font)", opacity: draft.trim() ? 1 : 0.5 }}>
              Save Version
            </button>
          </div>
          {err && <span style={{ color: "#f87171", fontSize: "0.75rem" }}>{err}</span>}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {cat.versions.map(v => (
          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--c-text-2)", minWidth: 28 }}>v{v.version_no}</span>
            <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: (CHANGE_CLASS_COLOR[v.change_class] ?? "#94a3b8") + "20", color: CHANGE_CLASS_COLOR[v.change_class] ?? "#94a3b8", textTransform: "uppercase" }}>
              {v.change_class}
            </span>
            <span style={{ color: "var(--c-text-3)" }}>{v.author_display ?? "—"}</span>
            {v.change_reason && <span style={{ color: "var(--c-text-3)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{v.change_reason}”</span>}
          </div>
        ))}
      </div>
    </Section>
  );
}
