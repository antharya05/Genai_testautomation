import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import { parseText, uploadFile } from "../../api/client";
import type { UploadResult } from "../../types";

interface Props {
  onSuccess: (data: UploadResult) => void;
  onError: (msg: string) => void;
}

const ALLOWED = [".pdf", ".docx", ".txt"];

function FileTab({ onSuccess, onError }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null | undefined) {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      onError(`"${ext}" is not supported. Allowed: ${ALLOWED.join(", ")}`);
      return;
    }
    setFile(f);
    setProgress(0);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const data = await uploadFile(file, setProgress);
      if (data.error) onError(data.error);
      else onSuccess(data);
    } catch {
      onError("Upload failed. Is the backend running on port 8000?");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <motion.div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
        animate={{
          borderColor: dragging ? "var(--c-accent)" : file ? "var(--c-accent)" : "var(--c-border-2)",
          background: dragging ? "rgba(99,102,241,0.08)" : file ? "rgba(99,102,241,0.04)" : "transparent",
        }}
        className="drop-zone"
        style={{ cursor: "pointer" }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(",")}
          style={{ display: "none" }}
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <AnimatePresence mode="wait">
          {file ? (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: "rgba(99,102,241,0.1)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>{file.name}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 2 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
            >
              <motion.div
                animate={{ y: dragging ? -8 : 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: "var(--c-surface-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </motion.div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>
                  {dragging ? "Drop to upload" : "Drag & drop or click to select"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 3 }}>
                  PDF · DOCX · TXT · Max 50MB
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {uploading && progress > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="progress-track">
              <motion.div className="progress-fill" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 4, textAlign: "right" }}>
              {progress.toFixed(0)}% uploaded
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={handleUpload}
        disabled={!file || uploading}
        whileHover={file && !uploading ? { scale: 1.01 } : {}}
        whileTap={file && !uploading ? { scale: 0.99 } : {}}
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "12px 20px", fontSize: "0.9375rem" }}
      >
        {uploading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }}
            />
            Uploading…
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload & Extract Requirements
          </>
        )}
      </motion.button>
    </div>
  );
}

function PasteTab({ onSuccess, onError }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleParse() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const data = await parseText(text);
      if (data.error) onError(data.error);
      else onSuccess(data);
    } catch {
      onError("Failed to parse text. Is the backend running on port 8000?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ position: "relative" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"Paste your requirements here:\n\nREQ_001: The braking system shall respond within 100ms of obstacle detection. ASIL-D.\nREQ_002: The ECU shall detect sensor faults within 2 diagnostic cycles. ASIL-C.\n\n— or numbered lists, or any text containing 'shall' statements —"}
          className="input"
          style={{ width: "100%", resize: "none", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", lineHeight: 1.65, minHeight: 220 }}
        />
        <span style={{
          position: "absolute", bottom: 10, right: 12,
          fontSize: "0.6875rem", color: "var(--c-text-3)", pointerEvents: "none",
        }}>
          {text.length.toLocaleString()} chars
        </span>
      </div>

      <motion.button
        onClick={handleParse}
        disabled={!text.trim() || loading}
        whileHover={text.trim() && !loading ? { scale: 1.01 } : {}}
        whileTap={text.trim() && !loading ? { scale: 0.99 } : {}}
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "12px 20px", fontSize: "0.9375rem" }}
      >
        {loading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }}
            />
            Parsing requirements…
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            Parse Requirements
          </>
        )}
      </motion.button>
    </div>
  );
}

export function UploadBox({ onSuccess, onError }: Props) {
  const [tab, setTab] = useState<"file" | "text">("file");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ maxWidth: 520, width: "100%", margin: "0 auto" }}
    >
      {/* Hero text */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: "var(--r-full)",
            background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
            fontSize: "0.6875rem", fontWeight: 600, color: "var(--c-accent)",
            letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 16,
          }}
        >
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--c-accent)" }}
          />
          ISO 26262 · ASIL-D · AUTOSAR · Knowledge-Augmented
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--c-text)", margin: "0 0 8px", letterSpacing: "-0.02em", lineHeight: 1.2 }}
        >
          Generate Test Cases Instantly
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          style={{ fontSize: "0.875rem", color: "var(--c-text-3)", lineHeight: 1.6, maxWidth: 380, margin: "0 auto" }}
        >
          Upload a requirements document and generate professional ISO 26262 test cases with full ASIL classification.
        </motion.p>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.35 }}
        className="card"
        style={{ overflow: "hidden", padding: 0 }}
      >
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--c-border)" }}>
          {(["file", "text"] as const).map((id) => (
            <motion.button
              key={id}
              onClick={() => setTab(id)}
              whileHover={{ background: "var(--c-surface-2)" }}
              style={{
                flex: 1, padding: "13px 0",
                fontSize: "0.8125rem", fontWeight: 600,
                border: "none", cursor: "pointer",
                fontFamily: "var(--font)",
                background: tab === id ? "rgba(99,102,241,0.06)" : "transparent",
                color: tab === id ? "var(--c-accent)" : "var(--c-text-3)",
                borderBottom: tab === id ? "2px solid var(--c-accent)" : "2px solid transparent",
                transition: "all var(--t-fast)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {id === "file" ? (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Upload File</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Paste Text</>
              )}
            </motion.button>
          ))}
        </div>

        <div style={{ padding: 24 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: tab === "file" ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: tab === "file" ? 12 : -12 }}
              transition={{ duration: 0.2 }}
            >
              {tab === "file"
                ? <FileTab onSuccess={onSuccess} onError={onError} />
                : <PasteTab onSuccess={onSuccess} onError={onError} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
