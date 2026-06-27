import axios from "axios";
import type { ActiveProvider, Baseline, BaselineDiff, CatalogDetail, CatalogRequirement, CoverageSummary, JobStatus, ParsedRequirement, Project, ProjectStats, ProviderConfig, ProviderHealth, ProviderMetric, RequirementDetail, RequirementOverview, ReviewEvent, ReviseResult, Run, RunApprovalEvent, RunGovernance, RunRequirement, RunReviewSummary, RunTraceability, RunValidation, TestCase, UploadResult } from "../types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const api = axios.create({ baseURL: BASE });

// ─── Auth token plumbing ──────────────────────────────────────────────────────

export const TOKEN_KEY = "autotest_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 (expired/invalid token), clear the session and bounce to sign-in —
// except for the login request itself, whose 401 means "wrong password".
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error?.config?.url ?? "";
    // Auth endpoints report their own errors (wrong password, etc.) — never let a
    // 401 from them clear the session or bounce the user mid-form.
    if (error?.response?.status === 401 && !url.includes("/auth/")) {
      clearToken();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
        window.location.href = "/signin";
      }
    }
    return Promise.reject(error);
  },
);

export const ACTOR_KEY = "autotest_actor";

export interface SessionActor { actor_id: string | null; actor_display: string | null; }

export function getActor(): SessionActor {
  try { return JSON.parse(localStorage.getItem(ACTOR_KEY) || "{}"); }
  catch { return { actor_id: null, actor_display: null }; }
}

/** Exchange the shared app password for a bearer token. Throws on bad password.
 *  The email/name become the reviewer identity recorded against governance actions. */
export async function login(password: string, email?: string, name?: string): Promise<string> {
  const res = await api.post<{ token: string; actor_id: string | null; actor_display: string | null }>(
    "/auth/login", { password, email, name },
  );
  setToken(res.data.token);
  localStorage.setItem(ACTOR_KEY, JSON.stringify({
    actor_id: res.data.actor_id, actor_display: res.data.actor_display,
  }));
  return res.data.token;
}

// ─── Email / password identity (Phase 4.6) ────────────────────────────────────

export interface AuthSessionResult {
  token: string;
  token_type: string;
  expires_in: number;
  user: { id: string | null; email: string | null; display_name: string | null; email_verified?: boolean };
  active_org_id: string | null;
  legacy?: boolean;
  verify_url?: string;
}

function storeSession(r: AuthSessionResult): void {
  setToken(r.token);
  localStorage.setItem(ACTOR_KEY, JSON.stringify({
    actor_id: r.user.email, actor_display: r.user.display_name,
  }));
}

/** Register a new email/password account. Auto-signs in (returns a session token). */
export async function registerEmail(email: string, password: string, name?: string): Promise<AuthSessionResult> {
  const res = await api.post<AuthSessionResult>("/auth/register", { email, password, name });
  storeSession(res.data);
  return res.data;
}

/** Sign in with email + password (falls back to legacy shared password server-side). */
export async function loginEmail(email: string, password: string): Promise<AuthSessionResult> {
  const res = await api.post<AuthSessionResult>("/auth/login/email", { email, password });
  storeSession(res.data);
  return res.data;
}

/** Begin a password reset. Always succeeds (no account enumeration). */
export async function forgotPassword(email: string): Promise<{ ok: boolean; reset_url?: string; reset_token?: string }> {
  const res = await api.post("/auth/password/forgot", { email });
  return res.data;
}

/** Complete a password reset with a token; auto-signs in on success. */
export async function resetPassword(token: string, password: string): Promise<AuthSessionResult & { ok: boolean }> {
  const res = await api.post<AuthSessionResult & { ok: boolean }>("/auth/password/reset", { token, password });
  if (res.data.token) storeSession(res.data);
  return res.data;
}

/** Confirm an email address from a verification token. */
export async function verifyEmail(token: string): Promise<{ ok: boolean; email?: string }> {
  const res = await api.post("/auth/verify-email", { token });
  return res.data;
}

/** Re-send the email verification link. */
export async function resendVerification(email: string): Promise<{ ok: boolean; verify_url?: string }> {
  const res = await api.post("/auth/verify-email/request", { email });
  return res.data;
}

// ─── OAuth / multi-user sessions (Phase 4.5) ──────────────────────────────────

export interface AuthProviders { oauth: string[]; legacy_password: boolean; }
export interface SessionInfo {
  authenticated: boolean;
  user: { id: string | null; email: string | null; display_name: string | null };
  active_org_id: string | null;
  role: string | null;
  is_legacy: boolean;
  orgs: { id: string; name: string; slug: string; role: string }[];
}

export async function getAuthProviders(): Promise<AuthProviders> {
  const res = await api.get<AuthProviders>("/auth/providers");
  return res.data;
}

export function oauthStartUrl(provider: string): string {
  return `${BASE}/auth/oauth/${provider}/start`;
}

export async function getAuthSession(): Promise<SessionInfo> {
  const res = await api.get<SessionInfo>("/auth/session");
  return res.data;
}

export async function serverLogout(): Promise<void> {
  try { await api.post("/auth/logout"); } catch { /* best effort */ }
}

export async function switchOrg(orgId: string): Promise<string> {
  const res = await api.post<{ token: string }>("/auth/switch-org", { org_id: orgId });
  setToken(res.data.token);
  return res.data.token;
}

export async function checkSession(): Promise<boolean> {
  if (!getToken()) return false;
  try {
    await api.get("/auth/me");
    return true;
  } catch {
    return false;
  }
}

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
  parsed?: ParsedRequirement[],
): Promise<{ job_id?: string; total?: number; error?: string; error_type?: string }> {
  const body: {
    requirements: string[];
    project_id: string | null;
    parsed?: ParsedRequirement[];
  } = {
    requirements,
    project_id: projectId ?? null,
  };
  // Only include `parsed` when we actually have it, so legacy/demo inputs keep
  // the original string-only request shape and backend behaviour.
  if (parsed && parsed.length > 0) {
    body.parsed = parsed;
  }
  // Strict BYOK: the backend returns { error, error_type } (and no job_id) when
  // no provider key is configured, so callers must check for `error`.
  const res = await api.post<{ job_id?: string; total?: number; error?: string; error_type?: string }>(
    "/generate",
    body,
  );
  return res.data;
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await api.get<JobStatus>(`/jobs/${jobId}`);
  return res.data;
}

export function openJobStream(jobId: string): EventSource {
  // EventSource cannot set headers, so the bearer token rides in the query string.
  const token = getToken();
  const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
  return new EventSource(`${BASE}/jobs/${jobId}/stream${suffix}`);
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

export async function updateProject(projectId: string, name?: string, description?: string): Promise<Project> {
  const res = await api.patch<Project>(`/projects/${projectId}`, { name, description });
  return res.data;
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`/projects/${projectId}`);
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

export async function getRunRequirements(runId: string): Promise<RunRequirement[]> {
  const res = await api.get<RunRequirement[]>(`/runs/${runId}/requirements`);
  return res.data;
}

export async function getRunTraceability(runId: string): Promise<RunTraceability> {
  const res = await api.get<RunTraceability>(`/runs/${runId}/traceability`);
  return res.data;
}

export async function getRunValidation(runId: string): Promise<RunValidation> {
  const res = await api.get<RunValidation>(`/runs/${runId}/validation`);
  return res.data;
}

/** Download a historical run export, reconstructed server-side from persisted
 * data (no client test-case state required). Streams straight to a file.
 * Pass `status` (e.g. "approved") to export only review-matching cases. */
export async function downloadRunExport(
  runId: string,
  format: "excel" | "csv",
  status?: string,
): Promise<void> {
  const res = await api.get(`/runs/${runId}/export/${format}`, {
    responseType: "blob",
    params: status ? { status } : undefined,
  });
  // Prefer the server-provided filename when present.
  const cd: string = res.headers?.["content-disposition"] ?? "";
  const match = cd.match(/filename="?([^"]+)"?/);
  const ext = format === "excel" ? "xlsx" : "csv";
  const filename = match?.[1] ?? `run_${runId.slice(0, 8)}.${ext}`;
  downloadBlob(res.data as Blob, filename);
}

// ─── Review (run-scoped) ───────────────────────────────────────────────────────

export async function getRunReviewSummary(runId: string): Promise<RunReviewSummary> {
  const res = await api.get<RunReviewSummary>(`/runs/${runId}/review/summary`);
  return res.data;
}

export async function getRunReviewEvents(runId: string, testId?: string): Promise<ReviewEvent[]> {
  const res = await api.get<{ events: ReviewEvent[] }>(`/runs/${runId}/review/events`, {
    params: testId ? { test_id: testId } : undefined,
  });
  return res.data.events;
}

// ─── Run-level review governance (Phase 3) ────────────────────────────────────

export async function getRunGovernance(runId: string): Promise<RunGovernance> {
  const res = await api.get<RunGovernance>(`/runs/${runId}/governance`);
  return res.data;
}

export async function approveRun(runId: string, note?: string): Promise<RunGovernance> {
  const res = await api.post<RunGovernance>(`/runs/${runId}/approve`, { note });
  return res.data;
}

export async function rejectRun(runId: string, note?: string): Promise<RunGovernance> {
  const res = await api.post<RunGovernance>(`/runs/${runId}/reject`, { note });
  return res.data;
}

export async function reopenRun(runId: string, note?: string): Promise<RunGovernance> {
  const res = await api.post<RunGovernance>(`/runs/${runId}/reopen`, { note });
  return res.data;
}

export async function getRunApprovalEvents(runId: string): Promise<RunApprovalEvent[]> {
  const res = await api.get<{ events: RunApprovalEvent[] }>(`/runs/${runId}/approval/events`);
  return res.data.events;
}

// ─── Requirements lifecycle: catalog, versions, baselines (Phase 4) ───────────

export async function listCatalog(projectId: string): Promise<CatalogRequirement[]> {
  const res = await api.get<CatalogRequirement[]>(`/projects/${projectId}/catalog`);
  return res.data;
}

export async function getCatalogDetail(projectId: string, key: string): Promise<CatalogDetail> {
  const res = await api.get<CatalogDetail>(`/projects/${projectId}/catalog/${encodeURIComponent(key)}`);
  return res.data;
}

export async function reviseRequirement(
  projectId: string, key: string,
  body: { statement: string; meta?: Record<string, unknown>; change_reason?: string; change_class?: string },
): Promise<ReviseResult> {
  const res = await api.post<ReviseResult>(`/projects/${projectId}/catalog/${encodeURIComponent(key)}/revise`, body);
  return res.data;
}

export async function listBaselines(projectId: string): Promise<Baseline[]> {
  const res = await api.get<Baseline[]>(`/projects/${projectId}/baselines`);
  return res.data;
}

export async function createBaseline(projectId: string, name: string, note?: string): Promise<Baseline> {
  const res = await api.post<Baseline>(`/projects/${projectId}/baselines`, { name, note });
  return res.data;
}

export async function getBaseline(baselineId: string): Promise<Baseline> {
  const res = await api.get<Baseline>(`/baselines/${baselineId}`);
  return res.data;
}

export async function diffBaselines(projectId: string, a: string, b: string): Promise<BaselineDiff> {
  const res = await api.get<BaselineDiff>(`/projects/${projectId}/baselines/diff`, { params: { a, b } });
  return res.data;
}

export async function downloadBaselineExcel(baselineId: string): Promise<Blob> {
  const res = await api.get(`/baselines/${baselineId}/export/excel`, { responseType: "blob" });
  return res.data as Blob;
}

// ─── Requirements Workspace ─────────────────────────────────────────────────────

export async function getProjectRequirements(projectId: string): Promise<RequirementOverview[]> {
  const res = await api.get<RequirementOverview[]>(`/projects/${projectId}/requirements`);
  return res.data;
}

export async function getCoverageSummary(projectId: string): Promise<CoverageSummary> {
  const res = await api.get<CoverageSummary>(`/projects/${projectId}/coverage`);
  return res.data;
}

export async function getRequirementDetail(projectId: string, requirementKey: string): Promise<RequirementDetail> {
  const res = await api.get<RequirementDetail>(
    `/projects/${projectId}/requirements/${encodeURIComponent(requirementKey)}`,
  );
  return res.data;
}

// ─── Provider keys (BYOK) ─────────────────────────────────────────────────────

export async function listProviderKeys(): Promise<ProviderConfig[]> {
  const res = await api.get<ProviderConfig[]>("/providers/keys");
  return res.data;
}

export async function saveProviderKey(provider: string, apiKey?: string, endpoint?: string, model?: string): Promise<void> {
  await api.post("/providers/keys", { provider, api_key: apiKey, endpoint, model });
}

export async function getActiveProvider(): Promise<ActiveProvider> {
  const res = await api.get<ActiveProvider>("/providers/active");
  return res.data;
}

export async function deleteProviderKey(provider: string): Promise<void> {
  await api.delete(`/providers/keys/${provider}`);
}

export async function getProviderHealth(): Promise<ProviderHealth[]> {
  const res = await api.get<{ providers: ProviderHealth[] }>("/providers/health");
  return res.data.providers;
}

export async function getProviderMetrics(): Promise<ProviderMetric[]> {
  const res = await api.get<{ metrics: ProviderMetric[] }>("/providers/metrics");
  return res.data.metrics;
}

// ─── Review ───────────────────────────────────────────────────────────────────

export async function patchTestCaseReview(
  runId: string,
  testId: string,
  reviewStatus?: string,
  reviewNote?: string,
): Promise<TestCase> {
  const body: Record<string, string> = {};
  if (reviewStatus !== undefined) body.review_status = reviewStatus;
  if (reviewNote !== undefined) body.review_note = reviewNote;
  // Run-scoped: test_id is only unique within a run.
  const res = await api.patch<TestCase>(`/runs/${runId}/test-cases/${testId}/review`, body);
  return res.data;
}
