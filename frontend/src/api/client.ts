import axios from "axios";
import type { JobStatus, Project, ProjectStats, ProviderConfig, Run, TestCase, UploadResult } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const api = axios.create({ baseURL: BASE });

// ─── Upload & parse ───────────────────────────────────────────────────────────

export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<UploadResult>("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (e.total) onProgress?.(Math.round((e.loaded * 100) / e.total));
    },
  });
  return res.data;
}

export async function parseText(text: string): Promise<UploadResult> {
  const res = await api.post<UploadResult>("/parse-text", { text });
  return res.data;
}

// ─── Generation ───────────────────────────────────────────────────────────────

export async function startGeneration(
  requirements: string[],
  projectId?: string,
  provider?: string,
  model?: string,
): Promise<{ job_id: string; total: number }> {
  const res = await api.post<{ job_id: string; total: number }>("/generate", {
    requirements,
    project_id: projectId ?? null,
    provider: provider ?? null,
    model: model ?? null,
  });
  return res.data;
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await api.get<JobStatus>(`/jobs/${jobId}`);
  return res.data;
}

export function openJobStream(jobId: string): EventSource {
  return new EventSource(`${BASE}/jobs/${jobId}/stream`);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export async function exportExcel(testCases: TestCase[], projectName = "automotive_project"): Promise<Blob> {
  const res = await api.post(
    "/export/excel",
    { test_cases: testCases, project_name: projectName },
    { responseType: "blob" }
  );
  return res.data as Blob;
}

export async function exportCsv(testCases: TestCase[], projectName = "automotive_project"): Promise<Blob> {
  const res = await api.post(
    "/export/csv",
    { test_cases: testCases, project_name: projectName },
    { responseType: "blob" }
  );
  return res.data as Blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  const res = await api.get<Project[]>("/projects");
  return res.data;
}

export async function createProject(name: string, description?: string): Promise<Project> {
  const res = await api.post<Project>("/projects", { name, description: description ?? "" });
  return res.data;
}

export async function getProject(projectId: string): Promise<Project> {
  const res = await api.get<Project>(`/projects/${projectId}`);
  return res.data;
}

export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const res = await api.get<ProjectStats>(`/projects/${projectId}/stats`);
  return res.data;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function getProjectRuns(projectId: string, limit = 50): Promise<Run[]> {
  const res = await api.get<Run[]>(`/projects/${projectId}/runs`, { params: { limit } });
  return res.data;
}

export async function getRun(runId: string): Promise<Run> {
  const res = await api.get<Run>(`/runs/${runId}`);
  return res.data;
}

export async function getRunTestCases(runId: string): Promise<TestCase[]> {
  const res = await api.get<TestCase[]>(`/runs/${runId}/test-cases`);
  return res.data;
}

export async function getRunRequirements(runId: string): Promise<{ id: string; text: string; position: number }[]> {
  const res = await api.get(`/runs/${runId}/requirements`);
  return res.data;
}

// ─── Provider keys (BYOK) ─────────────────────────────────────────────────────

export async function listProviderKeys(): Promise<ProviderConfig[]> {
  const res = await api.get<ProviderConfig[]>("/providers/keys");
  return res.data;
}

export async function saveProviderKey(provider: string, apiKey?: string, endpoint?: string): Promise<void> {
  await api.post("/providers/keys", { provider, api_key: apiKey, endpoint });
}

export async function deleteProviderKey(provider: string): Promise<void> {
  await api.delete(`/providers/keys/${provider}`);
}
