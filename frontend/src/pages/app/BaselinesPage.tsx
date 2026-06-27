import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Download, GitCompare, Layers, Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createBaseline, diffBaselines, downloadBaselineExcel, downloadBlob, getBaseline, listBaselines } from "../../api/client";
import { PageTransition } from "../../components/layout/PageTransition";
import { useProject } from "../../context/ProjectContext";
import type { Baseline, BaselineDiff } from "../../types";

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

const STATE_COLOR: Record<string, string> = {
  approved: "#10b981", reviewed: "#60a5fa", rejected: "#f87171", draft: "#94a3b8",
};

export default function BaselinesPage() {
  const { selectedProject } = useProject();
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Baseline>>({});
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [diffA, setDiffA] = useState("");
  const [diffB, setDiffB] = useState("");
  const [diff, setDiff] = useState<BaselineDiff | null>(null);

  async function load() {
    if (!selectedProject) return;
    setLoading(true);
    try { setBaselines(await listBaselines(selectedProject.id)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedProject]);

  async function onCreate() {
    if (!selectedProject || !name.trim()) return;
    setError(null);
    const res = await createBaseline(selectedProject.id, name.trim(), note.trim() || undefined);
    if (res.error) { setError(res.error); return; }
    setName(""); setNote(""); setCreating(false);
    load();
  }

  async function toggle(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!detail[id]) {
      try { const d = await getBaseline(id); setDetail(prev => ({ ...prev, [id]: d })); }
      catch { /* ignore */ }
    }
  }

  async function onExport(id: string, bname: string) {
    try { downloadBlob(await downloadBaselineExcel(id), `baseline_${bname}.xlsx`); }
    catch { /* ignore */ }
  }

  async function runDiff() {
    if (!selectedProject || !diffA || !diffB || diffA === diffB) return;
    try { setDiff(await diffBaselines(selectedProject.id, diffA, diffB)); }
    catch { /* ignore */ }
  }

  const options = useMemo(() => baselines.map(b => ({ id: b.id, name: b.name })), [baselines]);

  return (
    <PageTransition>
      <div style={{ padding: "28px 32px 64px", maxWidth: 1080 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Layers size={17} color="#818cf8" strokeWidth={1.75} />
            </div>
            <div>
              <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--c-text)", letterSpacing: "-0.02em", margin: 0 }}>Baselines</h1>
              <p style={{ color: "var(--c-text-3)", fontSize: "0.8125rem", margin: 0 }}>Immutable snapshots of requirement versions + approved test cases</p>
            </div>
          </div>
          <button onClick={() => setCreating(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, cursor: "pointer", background: "var(--c-accent)", color: "white", border: "none", fontSize: "0.8125rem", fontWeight: 600, fontFamily: "var(--font)" }}>
            <Plus size={14} /> Cut Baseline
          </button>
        </div>

        {/* Create form */}
        <AnimatePresence>
          {creating && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden", marginBottom: 16 }}>
              <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Name (e.g. 1.0)"
                  style={{ padding: "7px 10px", borderRadius: 7, background: "var(--c-bg-2)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontFamily: "var(--font)", width: 140 }} />
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
                  style={{ padding: "7px 10px", borderRadius: 7, background: "var(--c-bg-2)", border: "1px solid var(--c-border)", color: "var(--c-text)", fontFamily: "var(--font)", flex: 1, minWidth: 180 }} />
                <button onClick={onCreate} disabled={!name.trim()}
                  style={{ padding: "7px 14px", borderRadius: 7, cursor: name.trim() ? "pointer" : "not-allowed", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", fontWeight: 600, fontFamily: "var(--font)", opacity: name.trim() ? 1 : 0.5 }}>
                  Create
                </button>
                {error && <span style={{ color: "#f87171", fontSize: "0.78rem" }}>{error}</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compare */}
        {baselines.length >= 2 && (
          <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <GitCompare size={15} color="var(--c-text-3)" />
            <span style={{ fontSize: "0.8rem", color: "var(--c-text-3)" }}>Compare</span>
            <select value={diffA} onChange={e => setDiffA(e.target.value)} style={selStyle}>
              <option value="">from…</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <span style={{ color: "var(--c-text-3)" }}>→</span>
            <select value={diffB} onChange={e => setDiffB(e.target.value)} style={selStyle}>
              <option value="">to…</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button onClick={runDiff} disabled={!diffA || !diffB || diffA === diffB}
              style={{ padding: "6px 12px", borderRadius: 7, cursor: "pointer", background: "var(--c-bg-2)", border: "1px solid var(--c-border)", color: "var(--c-text-2)", fontWeight: 600, fontFamily: "var(--font)" }}>
              Diff
            </button>
            {diff && !diff.error && (
              <div style={{ display: "flex", gap: 12, marginLeft: 8, fontSize: "0.78rem" }}>
                <span style={{ color: "#10b981" }}>+{diff.added.length} added</span>
                <span style={{ color: "#f59e0b" }}>~{diff.modified.length} modified</span>
                <span style={{ color: "#f87171" }}>−{diff.removed.length} removed</span>
                <button onClick={() => setDiff(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)" }}><X size={13} /></button>
              </div>
            )}
          </div>
        )}
        {diff && !diff.error && (diff.added.length + diff.modified.length + diff.removed.length) > 0 && (
          <div style={{ background: "var(--c-bg-2)", border: "1px solid var(--c-border)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: "0.8rem", color: "var(--c-text-2)" }}>
            {diff.modified.map(m => <div key={m.requirement_key}>~ {m.requirement_key}: v{m.from_version_no} → v{m.to_version_no}</div>)}
            {diff.added.map(a => <div key={a.requirement_key} style={{ color: "#10b981" }}>+ {a.requirement_key} (v{a.version_no})</div>)}
            {diff.removed.map(r => <div key={r.requirement_key} style={{ color: "#f87171" }}>− {r.requirement_key}</div>)}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><Loader2 size={20} className="spin" color="var(--c-accent)" style={{ animation: "spin 1s linear infinite" }} /></div>
        ) : baselines.length === 0 ? (
          <div style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 16, padding: "56px 40px", textAlign: "center", color: "var(--c-text-3)" }}>
            No baselines yet. Cut one to freeze the current requirement versions and approved test cases.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {baselines.map(b => (
              <div key={b.id} style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--c-text)", fontFamily: "var(--font-mono)" }}>{b.name}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>{b.requirement_count} reqs · {b.approved_count} approved</span>
                  {b.note && <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)", fontStyle: "italic" }}>{b.note}</span>}
                  <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--c-text-3)" }}>{b.created_by_display ?? "—"} · {fmt(b.created_at)}</span>
                  <button onClick={() => onExport(b.id, b.name)} title="Export Excel" style={iconBtn}><Download size={14} /></button>
                  <button onClick={() => toggle(b.id)} style={iconBtn}>{expanded === b.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
                </div>
                <AnimatePresence initial={false}>
                  {expanded === b.id && detail[b.id] && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                      <div style={{ borderTop: "1px solid var(--c-border)", background: "var(--c-bg-2)", padding: "10px 16px" }}>
                        {(detail[b.id].items ?? []).map(it => (
                          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: "0.8rem" }}>
                            <span style={{ fontFamily: "var(--font-mono)", color: "var(--c-accent)", minWidth: 120 }}>{it.requirement_key}</span>
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(129,140,248,0.12)", color: "#818cf8" }}>v{it.version_no}</span>
                            {it.approval_state && (
                              <span style={{ fontSize: "0.68rem", fontWeight: 600, color: STATE_COLOR[it.approval_state] ?? "var(--c-text-3)" }}>{it.approval_state}</span>
                            )}
                            <span style={{ color: "var(--c-text-3)" }}>{it.test_case_count ?? 0} cases</span>
                            <span style={{ color: "var(--c-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.statement}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </PageTransition>
  );
}

const selStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 7, background: "var(--c-surface)", border: "1px solid var(--c-border)",
  color: "var(--c-text)", fontFamily: "var(--font)", cursor: "pointer", fontSize: "0.8rem",
};
const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", color: "var(--c-text-3)", padding: 4, display: "flex", alignItems: "center",
};
