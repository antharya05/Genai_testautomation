import { useState } from "react";
import axios from "axios";
import Navbar from "./components/Navbar";
import UploadBox from "./components/UploadBox";
import RequirementsPanel from "./components/RequirementsPanel";
import TestCaseTable from "./components/TestCaseTable";
import GeneratingScreen from "./components/GeneratingScreen";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function App() {
  const [phase, setPhase] = useState("upload");
  const [uploadData, setUploadData] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [error, setError] = useState("");

  async function handleUploadSuccess(data) {
    setUploadData(data);
    setError("");
    setPhase("review");
  }

  async function handleGenerate(requirements) {
    setPhase("generating");
    setError("");
    try {
      const res = await axios.post(`${API}/generate`, { requirements });
      if (res.data.error) {
        setError(res.data.error);
        setPhase("review");
      } else {
        setTestCases(res.data.test_cases || []);
        setPhase("results");
      }
    } catch {
      setError("Generation failed. Make sure the backend is running.");
      setPhase("review");
    }
  }

  function handleReset() {
    setPhase("upload");
    setUploadData(null);
    setTestCases([]);
    setError("");
  }

  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(ellipse at 60% 0%, #e0e7ff 0%, #f1f5f9 45%, #f8fafc 100%)" }}>
      <Navbar onReset={handleReset} phase={phase} />

      <main className={`mx-auto px-4 py-10
        ${phase === "upload" ? "max-w-3xl flex flex-col justify-center min-h-[calc(100vh-56px)]" : "max-w-5xl"}`}>

        {error && (
          <div className="mb-6 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {phase === "upload" && (
          <UploadBox apiBase={API} onSuccess={handleUploadSuccess} />
        )}

        {phase === "review" && uploadData && (
          <RequirementsPanel
            filename={uploadData.filename}
            requirements={uploadData.requirements}
            onGenerate={handleGenerate}
            onBack={handleReset}
          />
        )}

        {phase === "generating" && (
          <GeneratingScreen count={uploadData?.requirements?.length ?? 0} />
        )}

        {phase === "results" && (
          <TestCaseTable
            testCases={testCases}
            onBack={() => setPhase("review")}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}
