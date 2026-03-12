import type {
  CaseCheckStatus,
  CaseCheckType,
  CaseResearchStatus,
  ResearchCheckOutcome,
  ResearchErrorCode,
} from "@/lib/features/cases/research";

export type ResearchRunRow = {
  completed_at: string | null;
  completed_checks_count: number;
  evidence_created_count: number;
  failed_checks_count: number;
  id: string;
  processed_checks_count: number;
  started_at: string;
  status: "running" | "completed" | "failed";
  trigger_source: "manual" | "cron" | "case_manual";
};

export type ResearchCheckOpsRow = {
  attempt_count: number;
  candidate_full_name: string;
  case_id: string;
  check_type: CaseCheckType;
  completed_at: string | null;
  error_code: ResearchErrorCode | null;
  error_text: string | null;
  id: string;
  outcome: ResearchCheckOutcome | null;
  research_status: CaseResearchStatus;
  result_summary: string | null;
  source_url: string | null;
  status: CaseCheckStatus;
};

export type ResearchOpsSummary = {
  completedChecks: number;
  failedChecks: number;
  missingSourceChecks: number;
  noMatchChecks: number;
  pendingChecks: number;
  runningChecks: number;
  skippedChecks: number;
};
