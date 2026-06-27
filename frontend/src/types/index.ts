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
  id?: string;
  run_id?: string;
  test_id: string;
  requirement_id: string;
  title: string;
  asil: ASIL;
  test_type: TestType;
  preconditions: string[];
  steps: string[];
  expected_results: string[];
  asil_source?: string;
  asil_confidence?: number;
  boundary_position?: string;
  source_requirement_text?: string;
  generation_timestamp?: string;
  model_version?: string;
  prompt_version?: string;
  retry_count?: number;
  validation_status?: string;
  coverage_warnings?: string[];
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
  status: "running" | "complete" | "warning" | "failed" | "error";
  provider?: string;
  model?: string;
  requirement_count: number;
  test_case_count: number;
  rag_enabled: boolean;
  prompt_version?: string;
  created_at: string;
  completed_at?: string;
  error?: string;
  reason?: string;
  // Provider observability
  failed_requirement_count?: number;
  error_count?: number;
  generation_duration?: number;
  fallback_used?: boolean;
  coverage_pct?: number;
  // Coverage intelligence
  functional_count?: number;
  boundary_count?: number;
  negative_count?: number;
  fault_injection_count?: number;
  timing_count?: number;
  recovery_count?: number;
  safety_count?: number;
  // Run-level review governance (Phase 3)
  review_state?: ReviewState;
  locked?: boolean;
  approved_by_display?: string | null;
  approved_at?: string | null;
}

// ─── Historical Run Artifacts ───────────────────────────────────────────────

export interface RunRequirement {
  id: string;
  run_id?: string;
  requirement_id: string;
  text: string;
  statement?: string;
  position: number;
  covered?: boolean | null;
  test_case_count?: number;
  validation_status?: string | null;
  coverage_warnings?: string[];
  // Generation outcome (distinct from coverage)
  generation_status?: GenerationStatus;
  failure_type?: FailureType | null;
  failure_reason?: string | null;
  last_attempt_at?: string | null;
  // Phase 4: requirement version context
  requirement_version_no?: number | null;
  current_version_no?: number | null;
  superseded?: boolean;
  supersede_severity?: string | null;
}

export interface RunTraceabilityRow extends RunRequirement {
  covered: boolean;
  test_case_count: number;
  validation_status: string;
  coverage_warnings: string[];
  linked_test_ids: string[];
  linked_test_cases: TestCase[];
}

export interface RunTraceability {
  run_id: string;
  total: number;
  covered: number;
  uncovered: number;
  coverage_pct: number;
  requirements: RunTraceabilityRow[];
}

export interface RunValidationRequirement {
  requirement_id: string;
  statement: string;
  position: number;
  covered: boolean;
  test_case_count: number;
  validation_status: string;
  coverage_warnings: string[];
}

export interface RunValidation {
  run_id: string;
  total: number;
  covered: number;
  uncovered: number;
  coverage_pct: number;
  requirement_summary: { valid: number; warning: number; uncovered: number };
  test_case_summary: { valid: number; warning: number };
  total_requirement_warnings: number;
  requirements: RunValidationRequirement[];
}

// ─── Review ─────────────────────────────────────────────────────────────────

export type ReviewStatus = "pending" | "approved" | "rejected" | "needs_revision";

export interface RunReviewSummary {
  run_id: string;
  total: number;
  reviewed: number;
  pending: number;
  approved: number;
  rejected: number;
  needs_revision: number;
  review_complete: boolean;
  approved_pct: number;
  last_reviewed_at?: string | null;
}

export interface ReviewEvent {
  id: string;
  run_id: string;
  test_case_id: string;
  test_id: string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  actor?: string | null;
  actor_id?: string | null;
  actor_display?: string | null;
  created_at: string;
}

// ─── Run-level review governance (Phase 3) ───────────────────────────────────

export type ReviewState = "draft" | "reviewed" | "approved" | "rejected";

export interface RunGovernance {
  run_id: string;
  review_state: ReviewState;
  locked: boolean;
  approved_by_id?: string | null;
  approved_by_display?: string | null;
  approved_at?: string | null;
  review_digest?: string | null;
  stale: boolean;
  // Phase 4: requirement-version drift (approval invalidation)
  requirement_superseded?: boolean;
  supersede_severity?: "editorial" | "minor" | "major" | null;
  requirement_drift?: { requirement_key: string; from_version_no: number; to_version_no: number | null; severity: string }[];
  summary: RunReviewSummary;
  error?: string;
}

// ─── Requirements lifecycle (Phase 4) ────────────────────────────────────────

export type ChangeClass = "editorial" | "minor" | "major";

export interface RequirementVersion {
  id: string;
  requirement_id: string;
  version_no: number;
  statement: string;
  meta?: Record<string, unknown> | null;
  content_hash: string;
  change_class: ChangeClass;
  change_reason?: string | null;
  author_id?: string | null;
  author_display?: string | null;
  created_at: string;
}

export interface CatalogRequirement {
  id: string;
  project_id: string;
  requirement_key: string;
  title?: string | null;
  archived: boolean;
  current_version_no?: number | null;
  current_version_id?: string | null;
  statement?: string | null;
  change_class?: ChangeClass | null;
  updated_at?: string | null;
}

export interface RequirementImpact {
  requirement_key?: string;
  from_version_no?: number;
  affected_runs?: string[];
  affected_run_count: number;
  approved_run_count: number;
  affected_test_cases: number;
  affected_baselines: number;
}

export interface RequirementChangeEvent {
  id: string;
  requirement_id: string;
  event_type: string;
  from_version_id?: string | null;
  to_version_id?: string | null;
  change_class?: ChangeClass | null;
  actor_id?: string | null;
  actor_display?: string | null;
  note?: string | null;
  impact_snapshot?: RequirementImpact | null;
  created_at: string;
}

export interface CatalogDetail extends CatalogRequirement {
  versions: RequirementVersion[];
  history: RequirementChangeEvent[];
}

export interface ReviseResult {
  version?: RequirementVersion;
  impact?: RequirementImpact | null;
  catalog?: CatalogRequirement;
  error?: string;
}

export interface BaselineItem {
  id: string;
  requirement_key?: string | null;
  version_no?: number | null;
  statement?: string | null;
  source_run_id?: string | null;
  approval_state?: string | null;
  coverage_pct?: number | null;
  test_case_count?: number | null;
  test_cases?: TestCase[];
}

export interface Baseline {
  id: string;
  project_id: string;
  name: string;
  note?: string | null;
  created_by_display?: string | null;
  created_by_id?: string | null;
  content_digest?: string | null;
  created_at: string;
  requirement_count: number;
  approved_count: number;
  items?: BaselineItem[];
  error?: string;
}

export interface BaselineDiff {
  from_baseline: { id: string; name: string };
  to_baseline: { id: string; name: string };
  added: { requirement_key: string; version_no: number }[];
  removed: { requirement_key: string; version_no: number }[];
  modified: { requirement_key: string; from_version_no: number; to_version_no: number }[];
  unchanged_count: number;
  error?: string;
}

export interface RunApprovalEvent {
  id: string;
  run_id: string;
  from_state?: string | null;
  to_state?: string | null;
  actor_id?: string | null;
  actor_display?: string | null;
  note?: string | null;
  approved_count?: number | null;
  total_count?: number | null;
  coverage_pct?: number | null;
  test_cases_digest?: string | null;
  created_at: string;
}

export interface ProjectStats {
  total_runs: number;
  completed_runs: number;
  total_test_cases: number;
  total_requirements: number;
}

// ─── Requirements Workspace ─────────────────────────────────────────────────────

export type CoverageStatus = "covered" | "partial" | "uncovered";

// Generation outcome — a SEPARATE axis from coverage. A requirement that failed
// generation (e.g. provider rate limit) is "generation_failed", never collapsed
// into "uncovered".
export type GenerationStatus =
  | "not_generated"
  | "pending"
  | "in_progress"
  | "generated"
  | "generation_failed";

export type FailureType =
  | "rate_limit"
  | "timeout"
  | "malformed_response"
  | "validation_failure"
  | "parsing_failure"
  | "provider_unavailable"
  | "unknown";

// Per-requirement generation outcome fields, shared by overview/detail/run rows.
export interface GenerationOutcome {
  generation_status: GenerationStatus;
  failure_type: FailureType | null;
  failure_reason: string | null;
  last_attempt_at: string | null;
}

// One row in the requirement-centric overview (deduped across a project's runs).
export interface RequirementOverview extends GenerationOutcome {
  key: string;             // dedupe key — requirement_id, or row id for unidentified reqs
  row_id: string;
  run_id: string;
  requirement_id: string;
  statement: string;
  asil: ASIL;
  asil_source: "requirement" | "estimated";
  category: string;
  quality_score: number | null;
  quality_level: string | null;
  coverage_count: number;
  coverage_status: CoverageStatus;
  has_metadata: boolean;
}

export interface QualityAnalysis {
  quality_score: number;
  quality_level: string;
  issues: string[];
  warnings: string[];
  strengths: string[];
}

// Full requirement intelligence for the detail drawer.
export interface RequirementDetail extends GenerationOutcome {
  requirement_id: string;
  row_id: string;
  run_id: string;
  statement: string;
  title: string | null;
  description: string | null;
  area: string | null;
  test_focus: string | null;
  category: string;
  asil: ASIL;
  asil_source: "requirement" | "estimated";
  asil_confidence: number;
  quality: QualityAnalysis | null;
  thresholds: string[];
  timing_constraints: string[];
  entities: string[];
  units: string[];
  logical_operators: string[];
  coverage_count: number;
  coverage_status: CoverageStatus;
  has_metadata: boolean;
  linked_test_cases: TestCase[];
  error?: string;
}

export interface CoverageSummary {
  total: number;
  covered: number;
  partially_covered: number;
  uncovered: number;
  coverage_pct: number;
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

export interface ProviderHealth {
  provider: string;
  model: string;
  configured: boolean;
  active: boolean;
  status: string;        // healthy | not_configured | invalid_key | rate_limit | quota_exhausted | provider_unavailable | ...
  label: string;         // Healthy | Invalid Key | Rate Limited | Quota Exhausted | Offline | Not Configured
  last_error?: string | null;
  latency_ms?: number | null;
  quota_state: string;   // ok | rate_limited | exhausted | unknown
  checked_at: string;
}

export interface ProviderMetric {
  provider: string;
  requests: number;
  failures: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency_ms: number;
  last_latency_ms?: number | null;
  error_rate: number;
  last_error?: string | null;
  last_used?: string | null;
}
