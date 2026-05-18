const STEPS = [
  { id: "upload",    label: "Upload" },
  { id: "review",    label: "Review" },
  { id: "results",   label: "Results" },
];

function phaseToStep(phase) {
  if (phase === "upload")                  return 0;
  if (phase === "review")                  return 1;
  if (phase === "generating")              return 2;
  if (phase === "results")                 return 2;
  return 0;
}

export default function Navbar({ onReset, phase }) {
  const currentStep = phaseToStep(phase);

  return (
    <nav className="bg-gradient-to-r from-slate-900 to-indigo-900 text-white px-8 shadow-xl">
      <div className="flex items-center justify-between h-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow">
            TC
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight">AI Test Case Generator</span>
            <span className="ml-2 text-indigo-400 text-xs hidden sm:inline">Automotive · ISO 26262</span>
          </div>
        </div>

        {/* Step breadcrumb */}
        {phase !== "upload" && (
          <div className="flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {STEPS.map((step, i) => (
              <div key={step.id} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all
                  ${i < currentStep  ? "text-indigo-300" :
                    i === currentStep ? "bg-white/15 text-white" :
                                        "text-indigo-500"}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${i < currentStep  ? "bg-indigo-400 text-white" :
                      i === currentStep ? "bg-white text-indigo-700" :
                                          "border border-indigo-600 text-indigo-500"}`}>
                    {i < currentStep ? (
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i + 1}
                  </span>
                  {step.label}
                </div>
                {i < STEPS.length - 1 && (
                  <span className="text-indigo-700 text-xs">›</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action */}
        {phase !== "upload" && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-lg transition font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        )}
      </div>
    </nav>
  );
}
