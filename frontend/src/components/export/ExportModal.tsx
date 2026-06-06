import { motion } from "framer-motion";
import { useState } from "react";
import { downloadBlob, exportCsv, exportExcel } from "../../api/client";
import type { TestCase } from "../../types";

interface Props {
  testCases: TestCase[];
  onClose: () => void;
  onToast: (kind: "success" | "error", msg: string) => void;
}

const FORMATS = [
  {
    id: "excel" as const,
    label: "Excel Workbook",
    ext: ".xlsx",
    description: "Two sheets: Test Cases + Traceability Matrix",
    accentColor: "#22C55E",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
    ),
  },
  {
    id: "csv" as const,
    label: "JIRA / Xray CSV",
    ext: ".csv",
    description: "Ready for import into JIRA Test Management",
    accentColor: "#6366F1",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.5">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
  },
];

export function ExportModal({ testCases, onClose, onToast }: Props) {
  const [projectName, setProjectName] = useState("automotive_project");
  const [exporting, setExporting] = useState<"excel" | "csv" | null>(null);

  async function doExport(format: "excel" | "csv") {
    setExporting(format);
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_");
      if (format === "excel") {
        const blob = await exportExcel(testCases, projectName);
        downloadBlob(blob, `${projectName}_${timestamp}.xlsx`);
        onToast("success", "Excel exported successfully");
      } else {
        const blob = await exportCsv(testCases, projectName);
        downloadBlob(blob, `${projectName}_${timestamp}_jira.csv`);
        onToast("success", "JIRA CSV exported successfully");
      }
      onClose();
    } catch {
      onToast("error", "Export failed. Is the backend running?");
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 100, backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: -12 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 101, width: "100%", maxWidth: 440,
          padding: "0 16px",
        }}
      >
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--c-border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--c-text)" }}>
                Export Test Cases
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 2 }}>
                {testCases.length} test cases ready for export
              </div>
            </div>
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="btn-icon"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </motion.button>
          </div>

          <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Project name */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--c-text-2)", marginBottom: 6 }}>
                Project Name
              </label>
              <input
                value={projectName}
                onChange={e => setProjectName(e.target.value.replace(/\s+/g, "_").toLowerCase())}
                className="input"
                style={{ width: "100%", fontSize: "0.875rem" }}
                placeholder="automotive_project"
              />
              <div style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", marginTop: 5 }}>
                Filename: {projectName}_YYYYMMDD.xlsx
              </div>
            </div>

            {/* Format options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {FORMATS.map(({ id, label, ext, description, accentColor, icon }) => {
                const isExporting = exporting === id;
                return (
                  <motion.button
                    key={id}
                    onClick={() => doExport(id)}
                    disabled={!!exporting}
                    whileHover={!exporting ? { x: 4 } : {}}
                    whileTap={!exporting ? { scale: 0.99 } : {}}
                    style={{
                      display: "flex", alignItems: "center", gap: 16,
                      padding: "14px 16px",
                      borderRadius: "var(--r-md)",
                      border: `1px solid ${accentColor}30`,
                      background: `${accentColor}06`,
                      cursor: exporting ? "not-allowed" : "pointer",
                      opacity: exporting && !isExporting ? 0.5 : 1,
                      fontFamily: "var(--font)",
                      textAlign: "left",
                      transition: "all var(--t-fast)",
                    }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: `${accentColor}12`, border: `1px solid ${accentColor}25`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--c-text)" }}>
                        {label}
                        <span style={{ fontSize: "0.6875rem", color: "var(--c-text-3)", fontWeight: 400, marginLeft: 6 }}>
                          {ext}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--c-text-3)", marginTop: 2 }}>
                        {description}
                      </div>
                    </div>
                    {isExporting ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        style={{
                          width: 18, height: 18, flexShrink: 0,
                          border: `2px solid ${accentColor}30`,
                          borderTopColor: accentColor,
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" style={{ flexShrink: 0 }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
