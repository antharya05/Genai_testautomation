import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnFiltersState,
  type ExpandedState,
} from "@tanstack/react-table";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import type { TestCase } from "../../types";
import { AsilBadge, TypeBadge } from "../ui/Badge";
import { TableSkeleton } from "../ui/Skeleton";

interface Props {
  testCases: TestCase[];
  loading?: boolean;
  onEdit: (id: string, field: keyof TestCase, value: string) => void;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onExport: () => void;
}

const col = createColumnHelper<TestCase>();

const ASIL_ORDER = ["QM", "A", "B", "C", "D"];

function EditableCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onChange(draft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); if (draft !== value) onChange(draft); }
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        className="input"
        style={{ width: "100%", fontSize: "0.8125rem", padding: "3px 8px" }}
      />
    );
  }
  return (
    <span
      onClick={() => { setEditing(true); setDraft(value); }}
      title="Click to edit"
      style={{
        display: "block", fontSize: "0.8125rem", color: "var(--c-text)",
        cursor: "text", padding: "2px 6px", borderRadius: 4,
        transition: "background var(--t-fast)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--c-surface-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {value}
    </span>
  );
}

function ExpandedRow({ tc, onEdit, onDelete }: {
  tc: TestCase;
  onEdit: (f: keyof TestCase, v: string) => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ overflow: "hidden" }}
    >
      <div style={{
        padding: "20px 24px",
        borderBottom: "1px solid var(--c-border)",
        background: "var(--c-surface-2)",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginBottom: 16 }}>
          {/* Preconditions */}
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
              Preconditions
            </div>
            <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tc.preconditions.map((p, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: "0.8125rem", color: "var(--c-text-2)", lineHeight: 1.45 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-accent)", flexShrink: 0, marginTop: 6 }} />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Test Steps */}
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
              Test Steps
            </div>
            <ol style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tc.steps.map((s, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: "0.8125rem", color: "var(--c-text-2)", lineHeight: 1.45 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    background: "rgba(99,102,241,0.1)", color: "var(--c-accent)",
                    fontSize: "0.6875rem", fontWeight: 700, fontFamily: "var(--font-mono)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          {/* Expected Results */}
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--c-text-3)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
              Expected Results
            </div>
            <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tc.expected_results.map((r, i) => (
                <li key={i} style={{ display: "flex", gap: 8, fontSize: "0.8125rem", color: "var(--c-text-2)", lineHeight: 1.45 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 3 }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Metadata row */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center",
          paddingTop: 12, borderTop: "1px solid var(--c-border)",
        }}>
          {tc.generation_timestamp && (
            <>
              <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                Model: <span style={{ color: "var(--c-text-2)" }}>{tc.model_version}</span>
              </span>
              <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                Prompt: <span style={{ color: "var(--c-text-2)" }}>{tc.prompt_version}</span>
              </span>
              <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
                Generated: <span style={{ color: "var(--c-text-2)" }}>{new Date(tc.generation_timestamp).toLocaleString()}</span>
              </span>
              {(tc.retry_count ?? 0) > 0 && (
                <span style={{ fontSize: "0.6875rem", color: "#F59E0B" }}>
                  Retries: {tc.retry_count}
                </span>
              )}
            </>
          )}

          {/* RAG info */}
          {tc.rag_sources && tc.rag_sources.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
              <span style={{ fontSize: "0.6875rem", color: "var(--c-accent)" }}>
                RAG: {tc.rag_sources.slice(0, 2).join(", ")}
                {tc.rag_top_score ? ` (${(tc.rag_top_score * 100).toFixed(0)}%)` : ""}
              </span>
            </div>
          )}

          <motion.button
            onClick={onDelete}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              marginLeft: "auto",
              fontSize: "0.75rem", color: "#EF4444",
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
              padding: "5px 12px", borderRadius: "var(--r-md)",
              cursor: "pointer", fontFamily: "var(--font)",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            Delete
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

const STAT_CONFIGS = [
  { key: "total", label: "Total Cases", color: "var(--c-text)", dimColor: "var(--c-surface-2)" },
  { key: "D", label: "ASIL-D", color: "#EF4444", dimColor: "rgba(239,68,68,0.08)" },
  { key: "C", label: "ASIL-C", color: "#F59E0B", dimColor: "rgba(245,158,11,0.08)" },
  { key: "B", label: "ASIL-B", color: "#6366F1", dimColor: "rgba(99,102,241,0.08)" },
  { key: "reqs", label: "Reqs Covered", color: "#22C55E", dimColor: "rgba(34,197,94,0.08)" },
];

export function TestCaseTable({ testCases, loading, onEdit, onDelete, onUndo, onRedo, canUndo, canRedo, onExport }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [asilFilter, setAsilFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = testCases;
    if (typeFilter !== "all") result = result.filter(t => t.test_type === typeFilter);
    if (asilFilter !== "all") result = result.filter(t => t.asil === asilFilter);
    return result;
  }, [testCases, typeFilter, asilFilter]);

  const testTypes = useMemo(() => ["all", ...Array.from(new Set(testCases.map(t => t.test_type)))], [testCases]);
  const asilLevels = useMemo(() => ["all", ...Array.from(new Set(testCases.map(t => t.asil))).sort((a, b) => ASIL_ORDER.indexOf(b) - ASIL_ORDER.indexOf(a))], [testCases]);

  const asilCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    testCases.forEach(tc => { counts[tc.asil] = (counts[tc.asil] ?? 0) + 1; });
    return counts;
  }, [testCases]);

  const uniqueReqs = useMemo(() => new Set(testCases.map(t => t.requirement_id)).size, [testCases]);

  const statValues: Record<string, number> = {
    total: testCases.length,
    D: asilCounts["D"] ?? 0,
    C: asilCounts["C"] ?? 0,
    B: asilCounts["B"] ?? 0,
    reqs: uniqueReqs,
  };

  const columns = useMemo(() => [
    col.display({
      id: "expand",
      cell: ({ row }) => (
        <motion.button
          onClick={row.getToggleExpandedHandler()}
          animate={{ rotate: row.getIsExpanded() ? 90 : 0 }}
          transition={{ duration: 0.18 }}
          style={{
            width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: row.getIsExpanded() ? "var(--c-accent)" : "var(--c-text-3)",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </motion.button>
      ),
      size: 36,
    }),
    col.accessor("test_id", {
      header: "ID",
      cell: info => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
          {info.getValue()}
        </span>
      ),
      size: 90,
    }),
    col.accessor("requirement_id", {
      header: "Req ID",
      cell: info => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--c-accent)", fontWeight: 600 }}>
          {info.getValue()}
        </span>
      ),
      size: 110,
    }),
    col.accessor("title", {
      header: "Title",
      cell: info => (
        <EditableCell
          value={info.getValue()}
          onChange={v => onEdit(info.row.original.test_id, "title", v)}
        />
      ),
      filterFn: "includesString",
    }),
    col.accessor("test_type", {
      header: "Type",
      cell: info => <TypeBadge type={info.getValue()} />,
      size: 130,
    }),
    col.accessor("asil", {
      header: "ASIL",
      cell: info => <AsilBadge asil={info.getValue()} />,
      size: 80,
      sortingFn: (a, b) => ASIL_ORDER.indexOf(a.original.asil) - ASIL_ORDER.indexOf(b.original.asil),
    }),
    col.display({
      id: "steps",
      header: "Steps",
      cell: ({ row }) => (
        <span style={{ fontSize: "0.75rem", color: "var(--c-text-3)" }}>
          {row.original.steps.length}
        </span>
      ),
      size: 56,
    }),
  ], [onEdit]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnFilters, expanded, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onExpandedChange: setExpanded,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {STAT_CONFIGS.map(({ key, label, color, dimColor }, i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="card"
            style={{ padding: "14px 18px", background: dimColor, borderColor: `${color}30` }}
          >
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>
              {statValues[key]}
            </div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-text-3)" }}>
              {label}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Table card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="card"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", borderBottom: "1px solid var(--c-border)",
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--c-text)", marginRight: 4 }}>
            Test Cases
          </span>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)" strokeWidth="2"
              style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              placeholder="Search cases…"
              className="input"
              style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 5, paddingBottom: 5, fontSize: "0.8125rem", width: 180 }}
            />
          </div>

          {/* Undo/Redo */}
          <div style={{ display: "flex", gap: 4 }}>
            <motion.button
              onClick={onUndo} disabled={!canUndo}
              whileHover={canUndo ? { scale: 1.05 } : {}}
              whileTap={canUndo ? { scale: 0.95 } : {}}
              className="btn-icon"
              style={{ opacity: canUndo ? 1 : 0.3 }}
              title="Undo"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
              </svg>
            </motion.button>
            <motion.button
              onClick={onRedo} disabled={!canRedo}
              whileHover={canRedo ? { scale: 1.05 } : {}}
              whileTap={canRedo ? { scale: 0.95 } : {}}
              className="btn-icon"
              style={{ opacity: canRedo ? 1 : 0.3 }}
              title="Redo"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
              </svg>
            </motion.button>
          </div>

          <div style={{ marginLeft: "auto" }}>
            <motion.button
              onClick={onExport}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn btn-primary"
              style={{ fontSize: "0.8125rem", padding: "6px 14px" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </motion.button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 16px",
          background: "var(--c-surface-2)", borderBottom: "1px solid var(--c-border)",
          alignItems: "center",
        }}>
          <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", fontWeight: 600, marginRight: 4 }}>TYPE</span>
          {testTypes.map(t => {
            const count = t === "all" ? testCases.length : testCases.filter(tc => tc.test_type === t).length;
            const active = typeFilter === t;
            return (
              <motion.button
                key={t}
                onClick={() => setTypeFilter(t)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  fontSize: "0.6875rem", fontWeight: 500, padding: "3px 10px",
                  borderRadius: "var(--r-full)", border: "1px solid",
                  cursor: "pointer", fontFamily: "var(--font)",
                  background: active ? "var(--c-accent)" : "var(--c-surface)",
                  color: active ? "white" : "var(--c-text-3)",
                  borderColor: active ? "var(--c-accent)" : "var(--c-border-2)",
                  transition: "all var(--t-fast)",
                  textTransform: "capitalize",
                }}
              >
                {t === "all" ? "All" : t.replace(/_/g, " ")} {count}
              </motion.button>
            );
          })}

          <div style={{ width: 1, height: 16, background: "var(--c-border-2)", margin: "0 6px" }} />

          <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", fontWeight: 600, marginRight: 4 }}>ASIL</span>
          {asilLevels.map(a => {
            const count = a === "all" ? testCases.length : testCases.filter(tc => tc.asil === a).length;
            const active = asilFilter === a;
            return (
              <motion.button
                key={a}
                onClick={() => setAsilFilter(a)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  fontSize: "0.6875rem", fontWeight: 500, padding: "3px 10px",
                  borderRadius: "var(--r-full)", border: "1px solid",
                  cursor: "pointer", fontFamily: "var(--font)",
                  background: active ? "var(--c-accent)" : "var(--c-surface)",
                  color: active ? "white" : "var(--c-text-3)",
                  borderColor: active ? "var(--c-accent)" : "var(--c-border-2)",
                  transition: "all var(--t-fast)",
                }}
              >
                {a === "all" ? "All" : a} {count}
              </motion.button>
            );
          })}

          <span style={{ marginLeft: "auto", fontSize: "0.6875rem", color: "var(--c-text-3)" }}>
            {table.getRowModel().rows.length} shown
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <TableSkeleton rows={6} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id}>
                    {hg.headers.map(header => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className="tbl-hdr"
                        style={{
                          width: header.column.getSize() !== 150 ? header.column.getSize() : undefined,
                          cursor: header.column.getCanSort() ? "pointer" : "default",
                          userSelect: "none",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc" && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                          )}
                          {header.column.getIsSorted() === "desc" && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                <AnimatePresence>
                  {table.getRowModel().rows.map((row, i) => (
                    <>
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.2) }}
                        className="tbl-row"
                        style={{
                          background: row.getIsExpanded() ? "rgba(99,102,241,0.04)" : undefined,
                        }}
                      >
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} style={{ padding: "10px 12px" }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </motion.tr>
                      {row.getIsExpanded() && (
                        <tr key={`${row.id}-exp`}>
                          <td colSpan={columns.length} style={{ padding: 0 }}>
                            <ExpandedRow
                              tc={row.original}
                              onEdit={(f, v) => onEdit(row.original.test_id, f, v)}
                              onDelete={() => onDelete(row.original.test_id)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            {table.getRowModel().rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--c-text-3)", fontSize: "0.875rem" }}>
                No test cases match the current filter.
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
