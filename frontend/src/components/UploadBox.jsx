import { useState, useRef } from "react";
import axios from "axios";

const ALLOWED = [".pdf", ".docx", ".pptx", ".txt"];

function FileUploadTab({ apiBase, onSuccess }) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function pickFile(f) {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setError(`"${ext}" is not supported. Use PDF, DOCX, PPTX, or TXT.`);
      return;
    }
    setError("");
    setProgress(0);
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await axios.post(`${apiBase}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => setProgress(Math.round((e.loaded * 100) / e.total)),
      });
      if (res.data.error) setError(res.data.error);
      else onSuccess(res.data);
    } catch {
      setError("Upload failed. Is the backend running on port 8000?");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all
          ${dragging
            ? "border-indigo-500 bg-indigo-50"
            : file
            ? "border-indigo-400 bg-indigo-50/50"
            : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30"}`}
        onClick={() => inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.pptx,.txt"
          className="hidden"
          onChange={(e) => pickFile(e.target.files[0])}
        />
        {file ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-semibold text-slate-800 text-sm">{file.name}</p>
            <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="font-semibold text-slate-700">Drag & drop or click to select</p>
            <p className="text-xs text-slate-400 mt-1">PDF · DOCX · PPTX · TXT</p>
          </>
        )}
      </div>

      {uploading && progress > 0 && (
        <div className="w-full bg-slate-200 rounded-full h-1.5">
          <div
            className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
      >
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            Uploading…
          </span>
        ) : "Upload & Extract Requirements"}
      </button>
    </div>
  );
}

function PasteTextTab({ apiBase, onSuccess }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleParse() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${apiBase}/parse-text`, { text });
      if (res.data.error) setError(res.data.error);
      else onSuccess(res.data);
    } catch {
      setError("Failed to parse text. Is the backend running on port 8000?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={`Paste your requirements here. Supported formats:\n\nREQ_001: The braking system shall respond within 100ms.\nREQ_002: The ECU shall detect sensor faults within 2 diagnostic cycles.\n\n— or numbered lists —\n1. System shall maintain voltage within 11–14V.\n2. Firmware shall log all safety-critical events.\n\n— or any text with "shall" statements —`}
          className="w-full resize-none rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none px-4 py-3 text-sm text-slate-700 leading-relaxed placeholder:text-slate-400 transition"
        />
        <span className="absolute bottom-3 right-3 text-xs text-slate-400 pointer-events-none">
          {text.length} chars
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <button
        onClick={handleParse}
        disabled={!text.trim() || loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            Parsing requirements…
          </span>
        ) : "Parse Requirements"}
      </button>
    </div>
  );
}

export default function UploadBox({ apiBase, onSuccess }) {
  const [tab, setTab] = useState("file");

  return (
    <div className="max-w-xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-7">
        <h2 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">
          Generate Test Cases Instantly
        </h2>
        <p className="text-slate-500 text-sm max-w-sm mx-auto leading-relaxed">
          Upload a requirements document or paste text — AI generates structured ISO 26262 test cases with ASIL classification.
        </p>
      </div>

      {/* Card with tabs */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden ring-1 ring-slate-900/5">
        <div className="flex border-b border-slate-200">
          {[
            {
              id: "file", label: "Upload File",
              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            },
            {
              id: "text", label: "Paste Text",
              icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all
                ${tab === id
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "file"
            ? <FileUploadTab apiBase={apiBase} onSuccess={onSuccess} />
            : <PasteTextTab apiBase={apiBase} onSuccess={onSuccess} />
          }
        </div>
      </div>
    </div>
  );
}
