/**
 * Preserved original application logic — will be wired into GeneratePage
 * in the next UI phase once the new shell is reviewed and approved.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { openJobStream, startGeneration } from "../../api/client";
import { GeneratingScreen } from "../../components/GeneratingScreen";
import { ExportModal } from "../../components/export/ExportModal";
import { Header } from "../../components/layout/Header";
import { Sidebar } from "../../components/layout/Sidebar";
import { RequirementsPanel } from "../../components/RequirementsPanel";
import { TestCaseTable } from "../../components/review/TestCaseTable";
import { TraceabilityPanel } from "../../components/review/TraceabilityPanel";
import { ToastContainer } from "../../components/ui/Toast";
import { DemoLoader } from "../../components/upload/DemoLoader";
import { UploadBox } from "../../components/upload/UploadBox";
import { useToast } from "../../hooks/useToast";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import type { TestCase, UploadResult } from "../../types";

type Phase = "upload" | "review" | "generating" | "results";

export default function GenerateApp() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [uploadData, setUploadData] = useState<UploadResult | null>(null);
  const [genProgress, setGenProgress] = useState({
    current: 0, total: 0, casesFound: 0,
    currentReq: "", ragActive: false,
    genPhase: "queued" as "queued" | "generating" | "validating" | "done",
  });
  const [showExport, setShowExport] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const { state: testCases, set: setTestCases, undo, redo, reset: resetCases, canUndo, canRedo } = useUndoRedo<TestCase[]>([]);
  const { toasts, push: pushToast, dismiss } = useToast();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => () => esRef.current?.close(), []);

  function handleUploadSuccess(data: UploadResult) {
    setUploadData(data);
    setPhase("review");
    pushToast("success", `Extracted ${data.requirement_count} requirements from "${data.filename}"`);
  }

  function handleUploadError(msg: string) {
    pushToast("error", msg);
  }

  async function handleGenerate(requirements: string[]) {
    setPhase("generating");
    setGenProgress({ current: 0, total: requirements.length, casesFound: 0, currentReq: "", ragActive: true, genPhase: "queued" });

    try {
      const { job_id } = await startGeneration(requirements);
      const es = openJobStream(job_id);
      esRef.current = es;

      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const current = data.current ?? 0;
        const total = data.total ?? requirements.length;
        const cases: TestCase[] = data.test_cases ?? [];

        let genPhase: typeof genProgress.genPhase = "generating";
        if (data.type === "complete") genPhase = "done";
        else if (current === 0) genPhase = "queued";
        else if (current === total) genPhase = "validating";

        setGenProgress({
          current, total, casesFound: cases.length,
          currentReq: requirements[Math.max(0, current - 1)] ?? "",
          ragActive: true, genPhase,
        });

        if (data.type === "complete") {
          es.close();
          resetCases(cases);
          setPhase("results");
          pushToast("success", `Generated ${cases.length} test cases successfully`);
        }
        if (data.type === "error") {
          es.close();
          pushToast("error", data.message ?? "Generation failed");
          setPhase("review");
        }
      };

      es.onerror = () => {
        es.close();
        pushToast("error", "Connection to backend lost");
        setPhase("review");
      };
    } catch {
      pushToast("error", "Failed to start generation. Is the backend running?");
      setPhase("review");
    }
  }

  function handleEdit(id: string, field: keyof TestCase, value: string) {
    setTestCases(prev => prev.map(tc => tc.test_id === id ? { ...tc, [field]: value } : tc));
  }

  function handleDelete(id: string) {
    setTestCases(prev => prev.filter(tc => tc.test_id !== id));
    pushToast("info", "Test case deleted");
  }

  function handleReset() {
    esRef.current?.close();
    setPhase("upload");
    setUploadData(null);
    resetCases([]);
    setGenProgress({ current: 0, total: 0, casesFound: 0, currentReq: "", ragActive: false, genPhase: "queued" });
  }

  const progressPct = genProgress.total > 0 ? (genProgress.current / genProgress.total) * 100 : 0;
  const sidebarWidth = sidebarCollapsed ? 64 : 240;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--c-bg)" }}>
      <Sidebar phase={phase} onNavigate={setPhase} onCollapsedChange={setSidebarCollapsed} />
      <div style={{
        display: "flex", flexDirection: "column", flex: 1, minWidth: 0, overflow: "hidden",
        marginLeft: sidebarWidth, transition: "margin-left 0.3s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <Header
          phase={phase} testCount={testCases.length} onReset={handleReset}
          darkMode={darkMode} onToggleDark={() => setDarkMode(v => !v)}
        />
        <main className="main-content" style={{ flex: 1, overflowY: "auto", padding: "32px 32px" }}>
          <AnimatePresence mode="wait">
            {phase === "upload" && (
              <motion.div key="upload" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
                <UploadBox onSuccess={handleUploadSuccess} onError={handleUploadError} />
                <div style={{ width: "100%", maxWidth: 520 }}>
                  <DemoLoader onLoad={handleUploadSuccess} />
                </div>
              </motion.div>
            )}
            {phase === "review" && uploadData && (
              <motion.div key="review" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                <RequirementsPanel data={uploadData} onGenerate={handleGenerate} onBack={handleReset} />
              </motion.div>
            )}
            {phase === "generating" && (
              <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} style={{ display: "flex", flex: 1 }}>
                <GeneratingScreen progress={progressPct} currentReq={genProgress.currentReq} totalReqs={genProgress.total} completedReqs={genProgress.current} ragActive={genProgress.ragActive} phase={genProgress.genPhase} />
              </motion.div>
            )}
            {phase === "results" && (
              <motion.div key="results" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <TestCaseTable testCases={testCases} onEdit={handleEdit} onDelete={handleDelete} onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} onExport={() => setShowExport(true)} />
                {uploadData && uploadData.requirements.length > 0 && (
                  <TraceabilityPanel requirements={uploadData.requirements} testCases={testCases} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>
        {showExport && <ExportModal testCases={testCases} onClose={() => setShowExport(false)} onToast={pushToast} />}
      </AnimatePresence>
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
