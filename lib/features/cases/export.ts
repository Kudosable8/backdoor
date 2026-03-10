import { caseConfidenceLabels, caseStatusLabels, type CaseDetailRow } from "./types";
import {
  caseEvidenceStrengthLabels,
  caseEvidenceTypeLabels,
  type CaseScoreBand,
} from "./scoring";

type ExportEvidenceItem = {
  attachment_filename: string | null;
  created_at: string;
  created_by_name: string | null;
  score_delta: number;
  snippet_text: string | null;
  source_url: string | null;
  strength: keyof typeof caseEvidenceStrengthLabels;
  summary_text: string;
  evidence_type: keyof typeof caseEvidenceTypeLabels;
};

type ExportScoreEvent = {
  created_at: string;
  delta: number;
  explanation: string;
};

type ExportOutreachDraft = {
  body_markdown: string;
  created_at: string;
  recipient_email: string | null;
  status: string;
  subject: string;
};

type BuildCaseExportArgs = {
  caseItem: CaseDetailRow & {
    current_score: number;
    score_band: CaseScoreBand;
  };
  evidenceItems: ExportEvidenceItem[];
  outreachDrafts: ExportOutreachDraft[];
  scoreEvents: ExportScoreEvent[];
};

export function buildCaseExportMarkdown({
  caseItem,
  evidenceItems,
  outreachDrafts,
  scoreEvents,
}: BuildCaseExportArgs) {
  const lines = [
    `# Proof Pack: ${caseItem.candidate_full_name}`,
    "",
    "## Case summary",
    `- Client: ${caseItem.client_company_raw}`,
    `- Introduced role: ${caseItem.introduced_role_raw}`,
    `- Recruiter: ${caseItem.recruiter_name ?? "Not provided"}`,
    `- Submission date: ${caseItem.submission_date ?? "Not provided"}`,
    `- Status: ${caseStatusLabels[caseItem.status]}`,
    `- Score: ${caseItem.current_score} (${caseConfidenceLabels[caseItem.score_band]})`,
    `- Assignee: ${caseItem.assigned_to_user_name ?? "Unassigned"}`,
    `- Candidate location: ${caseItem.candidate_location ?? "Not provided"}`,
    `- Client website: ${caseItem.client_website ?? "Not provided"}`,
    `- Fee term reference: ${caseItem.fee_term_reference ?? "Not provided"}`,
    "",
    "## Imported notes",
    caseItem.notes?.trim() || "No import notes provided.",
    "",
    "## Evidence",
  ];

  if (evidenceItems.length === 0) {
    lines.push("No evidence recorded yet.");
  } else {
    for (const item of evidenceItems) {
      lines.push(
        `- [${item.created_at}] ${caseEvidenceTypeLabels[item.evidence_type]} / ${caseEvidenceStrengthLabels[item.strength]} / ${item.score_delta >= 0 ? "+" : ""}${item.score_delta}`,
      );
      lines.push(`  Summary: ${item.summary_text}`);
      lines.push(`  Source URL: ${item.source_url ?? "Not provided"}`);
      lines.push(`  Snippet: ${item.snippet_text ?? "Not provided"}`);
      lines.push(`  Attachment: ${item.attachment_filename ?? "None"}`);
      lines.push(`  Added by: ${item.created_by_name ?? "Unknown user"}`);
    }
  }

  lines.push("", "## Score explanation");

  if (scoreEvents.length === 0) {
    lines.push("No score events recorded yet.");
  } else {
    for (const event of scoreEvents) {
      lines.push(
        `- [${event.created_at}] ${event.delta >= 0 ? "+" : ""}${event.delta}: ${event.explanation}`,
      );
    }
  }

  lines.push("", "## Outreach drafts");

  if (outreachDrafts.length === 0) {
    lines.push("No outreach drafts created yet.");
  } else {
    for (const draft of outreachDrafts) {
      lines.push(
        `- [${draft.created_at}] ${draft.status.toUpperCase()} to ${draft.recipient_email ?? "No recipient set"}: ${draft.subject}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildOutreachDraft({
  caseItem,
  evidenceItems,
}: {
  caseItem: CaseDetailRow & { current_score: number; score_band: CaseScoreBand };
  evidenceItems: ExportEvidenceItem[];
}) {
  let recipientEmail = "";

  if (caseItem.client_website) {
    try {
      recipientEmail = `hiring@${new URL(caseItem.client_website).hostname.replace(/^www\./, "")}`;
    } catch {
      recipientEmail = "";
    }
  }
  const subject = `Candidate introduction fee review: ${caseItem.candidate_full_name} / ${caseItem.client_company_raw}`;
  const bulletLines =
    evidenceItems.length > 0
      ? evidenceItems.slice(0, 4).map((item) => `- ${item.summary_text}`)
      : ["- No structured evidence has been attached yet."];

  const body = [
    `Hi ${caseItem.client_company_raw} team,`,
    "",
    `We are reviewing the introduction history for ${caseItem.candidate_full_name}, introduced by our agency for the role of ${caseItem.introduced_role_raw}.`,
    "",
    "We have recorded the following supporting points:",
    ...bulletLines,
    "",
    `Current internal review score: ${caseItem.current_score} (${caseConfidenceLabels[caseItem.score_band]} confidence).`,
    "",
    "Please confirm the current position and start history for this candidate so we can reconcile our records.",
    "",
    "Kind regards,",
    caseItem.assigned_to_user_name ?? "Backdoor Hire Review Team",
  ].join("\n");

  return {
    bodyMarkdown: body,
    recipientEmail,
    subject,
  };
}
