import type { AgencyRole } from "@/lib/features/auth/types";
import type {
  CaseEvidenceStrength,
  CaseEvidenceType,
  CaseScoreBand,
} from "./scoring";

export const CASE_STATUSES = [
  "new",
  "reviewing",
  "needs_more_evidence",
  "ready_to_contact",
  "contacted",
  "won",
  "lost",
  "dismissed",
] as const;

export const CASE_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CaseConfidence = (typeof CASE_CONFIDENCE_LEVELS)[number];

export const caseStatusLabels: Record<CaseStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  needs_more_evidence: "Needs More Evidence",
  ready_to_contact: "Ready To Contact",
  contacted: "Contacted",
  won: "Won",
  lost: "Lost",
  dismissed: "Dismissed",
};

export const caseConfidenceLabels: Record<CaseConfidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export type CaseQueueRow = {
  assigned_to_user_id: string | null;
  assigned_to_user_name: string | null;
  candidate_full_name: string;
  client_company_raw: string;
  confidence: CaseConfidence;
  created_at: string;
  id: string;
  introduced_role_raw: string;
  last_activity_at: string;
  recruiter_name: string | null;
  status: CaseStatus;
  submission_date: string | null;
};

export type CaseNoteRow = {
  author_name: string | null;
  author_user_id: string;
  body: string;
  created_at: string;
  id: string;
};

export type CaseAssigneeOption = {
  email: string | null;
  name: string;
  role: AgencyRole;
  user_id: string;
};

export type CaseDetailRow = {
  assigned_to_user_id: string | null;
  assigned_to_user_name: string | null;
  candidate_full_name: string;
  candidate_linkedin_url: string | null;
  candidate_location: string | null;
  client_company_raw: string;
  client_website: string | null;
  confidence: CaseConfidence;
  created_at: string;
  current_score: number;
  fee_term_reference: string | null;
  id: string;
  introduced_role_raw: string;
  last_activity_at: string;
  notes: string | null;
  recruiter_name: string | null;
  score_band: CaseScoreBand;
  status: CaseStatus;
  submission_date: string | null;
};

export type CaseEvidenceRow = {
  attachment_filename: string | null;
  attachment_signed_url: string | null;
  created_at: string;
  created_by_name: string | null;
  evidence_type: CaseEvidenceType;
  id: string;
  score_delta: number;
  snippet_text: string | null;
  source_url: string | null;
  strength: CaseEvidenceStrength;
  summary_text: string;
};

export type CaseScoreEventRow = {
  created_at: string;
  delta: number;
  explanation: string;
  id: string;
  rule_key: string;
};

export type OutreachMessageRow = {
  body_markdown: string;
  created_at: string;
  error_text: string | null;
  id: string;
  recipient_email: string | null;
  resend_email_id: string | null;
  sent_at: string | null;
  status: "draft" | "ready" | "sent" | "failed";
  subject: string;
};

export type CaseTimelineItem =
  | {
      body: string;
      created_at: string;
      id: string;
      kind: "note";
      title: string;
    }
  | {
      body: string;
      created_at: string;
      id: string;
      kind: "evidence";
      title: string;
    }
  | {
      body: string;
      created_at: string;
      id: string;
      kind: "score";
      title: string;
    }
  | {
      body: string;
      created_at: string;
      id: string;
      kind: "outreach";
      title: string;
    };
