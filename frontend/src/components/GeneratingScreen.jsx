import { useEffect, useState } from "react";

const MESSAGES = [
  "Reading your requirements…",
  "Classifying ASIL safety levels…",
  "Designing test scenarios…",
  "Writing preconditions and steps…",
  "Finalising expected results…",
];

export default function GeneratingScreen({ count }) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      {/* Spinner rings */}
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-600 animate-spin" />
        <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-indigo-300 animate-spin [animation-duration:1.4s]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-slate-800 mb-2">Generating Test Cases</h2>
      <p className="text-slate-400 text-sm mb-1">
        Processing <span className="font-semibold text-indigo-600">{count}</span> requirement{count !== 1 ? "s" : ""} with AI
      </p>

      {/* Cycling message */}
      <div className="h-6 mt-4 overflow-hidden">
        <p key={msgIndex} className="text-sm text-slate-500 animate-pulse">
          {MESSAGES[msgIndex]}
        </p>
      </div>

      {/* Dots */}
      <div className="flex gap-1.5 mt-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
