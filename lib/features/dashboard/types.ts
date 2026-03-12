import type { AgencyRole } from "@/lib/features/auth/types";
import type { CaseConfidence, CaseStatus } from "@/lib/features/cases/types";

export type DashboardStats = {
  completedResearchChecks: number;
  deliverableEmailCases: number;
  failedResearchChecks: number;
  highConfidenceCases: number;
  introductions: number;
  matchedResearchChecksLast7Days: number;
  noMatchResearchChecksLast7Days: number;
  pendingResearchChecks: number;
  readyToContactCases: number;
  recentResearchRunAt: string | null;
  recentResearchRunsCount: number;
  sentOutreach: number;
  totalCases: number;
  totalImports: number;
  userAssignedCases: number;
};

export type DashboardRecentCase = {
  candidate_full_name: string;
  client_company_raw: string;
  current_score: number;
  email_lookup_status:
    | "deliverable_found"
    | "no_match"
    | "queued"
    | "running"
    | "needs_review"
    | "missing_source"
    | "not_started";
  id: string;
  score_band: CaseConfidence;
  status: CaseStatus;
};

export type DashboardTopClient = {
  case_count: number;
  client_company_raw: string;
};

export type DashboardViewModel = {
  agencyName: string | null;
  agencyRole: AgencyRole | null;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  recentCases: DashboardRecentCase[];
  stats: DashboardStats | null;
  topClients: DashboardTopClient[];
  userId: string;
};
