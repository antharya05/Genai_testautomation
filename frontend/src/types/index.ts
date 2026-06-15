export type ASIL = "QM" | "A" | "B" | "C" | "D";

export type TestType =
  | "functional"
  | "boundary"
  | "negative"
  | "fault_injection"
  | "timing"
  | "safety"
  | "recovery"
  | "stress";

export interface TestCase {
  test_id: string;
  requirement_id: string;
  title: string;
  asil: ASIL;
  test_type: TestType;
  preconditions: string[];
  steps: string[];
  expected_results: string[];
  source_requirement_text?: string;
  generation_timestamp?: string;
  model_version?: string;
  prompt_version?: string;
  retry_count?: number;
  validation_status?: string;
  rag_sources?: string[];
  rag_top_score?: number;
  // Review workflow
  review_status?: "pending" | "approved" | "rejected" | "needs_revision";
  review_note?: string;
  reviewed_at?: string;
}

// Rich, deterministic parser output (mirrors backend ParsedRequirement.to_dict()).
// Optional fields are present only when the parser populated them.
export interface ParsedRequirement {
  requirement_id: string | null;
  title: string | null;
  statement: string;
  description: string | null;
  area: string | null;
  asil: string | null;
  test_focus: string | null;
  entities: string[];
  thresholds: string[];
  units: string[];
  timing_constraints: string[];
  logical_operators: string[];
  category: string;
  source: string;
  confidence: number;
}

export interface UploadResult {
  filename: string;
  extracted_text: string;
  requirements: string[];
  requirement_count: number;
  error?: string;
  // Additive multi-stage parse metadata. Absent for legacy/demo inputs, in
  // which case generation falls back to string-only mode.
  parsed?: ParsedRequirement[];
  parser_used?: string;
  confidence?: number;
  issues?: string[];
  document_type?: string;
}

export interface JobStatus {
  job_id: string;
  status: "running" | "complete" | "error";
  current: number;
  total: number;
  test_cases: TestCase[];
  error?: string;
}

export interface AppPhase {
  phase: "upload" | "review" | "generating" | "results";
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirements: string[];
  asilLevel?: string;
}

// ─── Projects ────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export interface Run {
  id: string;
  project_id: string;
  status: "running" | "complete" | "error";
  provider?: string;
  model?: string;
  requirement_count: number;
  test_case_count: number;
  rag_enabled: boolean;
  prompt_version?: string;
  created_at: string;
  completed_at?: string;
  error?: string;
  // Coverage intelligence
  functional_count?: number;
  boundary_count?: number;
  negative_count?: number;
  fault_injection_count?: number;
  timing_count?: number;
  recovery_count?: number;
  safety_count?: number;
}

export interface ProjectStats {
  total_runs: number;
  completed_runs: number;
  total_test_cases: number;
  total_requirements: number;
}

// ─── AI Providers (BYOK) ──────────────────────────────────────────────────────

export interface ProviderConfig {
  provider: string;
  has_key: boolean;
  endpoint?: string;
}

export interface ActiveProvider {
  provider: string;
  model: string;
  has_key: boolean;
}
