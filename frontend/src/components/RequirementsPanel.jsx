export default function RequirementsPanel({
  filename,
  requirements,
  onGenerate,
  onBack,
}) {
  const isText = filename === "Pasted Text";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              {isText ? (
                <svg className="w-4.5 h-4.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              ) : (
                <svg className="w-4.5 h-4.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Requirements Found</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {filename} &mdash;{" "}
                <span className="font-semibold text-indigo-600">
                  {requirements.length} requirement{requirements.length !== 1 ? "s" : ""} detected
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {isText ? "Back" : "Upload another"}
          </button>
        </div>

        {/* Requirements list */}
        {requirements.length === 0 ? (
          <div className="text-center py-14 px-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-semibold text-slate-600 text-sm mb-1">No requirements detected</p>
            <p className="text-xs text-slate-400">
              Use REQ_XXX IDs, numbered lists, or "shall" statements.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {requirements.map((req, i) => (
              <li key={i} className="flex gap-3 px-6 py-3 text-sm hover:bg-slate-50/70 transition">
                <span className="font-mono text-[11px] text-indigo-500 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 shrink-0 self-start mt-0.5 leading-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-slate-700 leading-relaxed">{req}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Footer / action */}
        {requirements.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60">
            <button
              onClick={() => onGenerate(requirements)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Test Cases &mdash; {requirements.length} requirement{requirements.length !== 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
