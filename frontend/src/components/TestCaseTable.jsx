import { useState } from "react";

const ASIL_COLORS = {
  "QM":     "bg-slate-100 text-slate-600 border-slate-200",
  "ASIL-A": "bg-green-100 text-green-700 border-green-200",
  "ASIL-B": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "ASIL-C": "bg-orange-100 text-orange-700 border-orange-200",
  "ASIL-D": "bg-red-100 text-red-700 border-red-200",
};

const TYPE_COLORS = {
  "functional":      "bg-indigo-100 text-indigo-700 border-indigo-200",
  "boundary":        "bg-purple-100 text-purple-700 border-purple-200",
  "fault_injection": "bg-rose-100 text-rose-700 border-rose-200",
  "regression":      "bg-slate-100 text-slate-600 border-slate-200",
};

const PRIORITY_BADGE = {
  "High":   "bg-red-50 text-red-600 border-red-200",
  "Medium": "bg-amber-50 text-amber-600 border-amber-200",
  "Low":    "bg-emerald-50 text-emerald-600 border-emerald-200",
};

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium border ${colorClass}`}>
      {label}
    </span>
  );
}

function Chevron({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${color}`}>
      <p className="text-2xl font-bold leading-none mb-1">{value}</p>
      <p className="text-xs font-semibold">{label}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

function TestCaseRow({ tc }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-slate-100 transition-colors
          ${expanded ? "bg-indigo-50/50" : "hover:bg-slate-50/80"}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3.5 font-mono text-xs text-slate-400 whitespace-nowrap">{tc.id}</td>
        <td className="px-4 py-3.5 font-mono text-xs text-indigo-500 whitespace-nowrap">{tc.requirement_id}</td>
        <td className="px-4 py-3.5 text-sm text-slate-800 font-medium max-w-xs">{tc.title}</td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <Badge
            label={tc.test_type.replace(/_/g, " ")}
            colorClass={TYPE_COLORS[tc.test_type] || "bg-slate-100 text-slate-600 border-slate-200"}
          />
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <Badge
            label={tc.asil_level}
            colorClass={ASIL_COLORS[tc.asil_level] || "bg-slate-100 text-slate-600 border-slate-200"}
          />
        </td>
        <td className="px-4 py-3.5 whitespace-nowrap">
          <Badge
            label={tc.priority}
            colorClass={PRIORITY_BADGE[tc.priority] || "bg-slate-100 text-slate-600 border-slate-200"}
          />
        </td>
        <td className="px-4 py-3.5">
          <Chevron open={expanded} />
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-50/80 border-b border-slate-200">
          <td colSpan={7} className="px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">

              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Preconditions</p>
                <ul className="space-y-1.5">
                  {tc.preconditions.map((p, i) => (
                    <li key={i} className="flex gap-2 text-slate-600 leading-snug">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-1.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Test Steps</p>
                <ol className="space-y-1.5">
                  {tc.steps.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-slate-600 leading-snug">
                      <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-100 rounded w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Expected Result</p>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-3 text-slate-700 leading-relaxed">
                  {tc.expected_result}
                </div>
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function TestCaseTable({ testCases, onBack, onReset }) {
  const [filter, setFilter] = useState("all");

  const types = ["all", ...new Set(testCases.map((t) => t.test_type))];
  const visible = filter === "all" ? testCases : testCases.filter((t) => t.test_type === filter);

  // Stats
  const highCount      = testCases.filter(t => t.priority === "High").length;
  const safetyCount    = testCases.filter(t => t.asil_level === "ASIL-C" || t.asil_level === "ASIL-D").length;
  const uniqueReqs     = new Set(testCases.map(t => t.requirement_id)).size;

  return (
    <div className="w-full space-y-5">

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Test Cases"
          value={testCases.length}
          color="bg-white border-slate-200 text-slate-700"
        />
        <StatCard
          label="High Priority"
          value={highCount}
          sub={`${Math.round((highCount / testCases.length) * 100)}% of total`}
          color="bg-red-50 border-red-100 text-red-700"
        />
        <StatCard
          label="Safety Critical"
          value={safetyCount}
          sub="ASIL-C or ASIL-D"
          color="bg-orange-50 border-orange-100 text-orange-700"
        />
        <StatCard
          label="Requirements"
          value={uniqueReqs}
          sub="unique IDs covered"
          color="bg-indigo-50 border-indigo-100 text-indigo-700"
        />
      </div>

      {/* Main table card */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800">
            Generated Test Cases
          </h2>
          <div className="flex gap-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Document
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-1.5 px-6 py-3 bg-slate-50/70 border-b border-slate-100">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition capitalize
                ${filter === t
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                  : "border-slate-200 text-slate-600 bg-white hover:border-indigo-300 hover:text-indigo-600"}`}
            >
              {t === "all"
                ? `All  ${testCases.length}`
                : `${t.replace(/_/g, " ")}  ${testCases.filter(tc => tc.test_type === t).length}`}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                {["ID", "Req", "Title", "Type", "ASIL", "Priority", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((tc) => (
                <TestCaseRow key={tc.id} tc={tc} />
              ))}
            </tbody>
          </table>
        </div>

        {visible.length === 0 && (
          <p className="text-center text-slate-400 py-10 text-sm">No test cases match the selected filter.</p>
        )}
      </div>
    </div>
  );
}
