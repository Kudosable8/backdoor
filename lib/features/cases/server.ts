import { notFound } from "next/navigation";

import type { AppUserContext } from "@/lib/features/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CaseAssigneeOption,
  CaseCheckRow,
  CaseDetailRow,
  CaseEvidenceRow,
  CaseNoteRow,
  CaseScoreEventRow,
  CaseTimelineItem,
  OutreachMessageRow,
} from "./types";

export async function getCaseDetailData({
  appUser,
  caseId,
}: {
  appUser: AppUserContext;
  caseId: string;
}) {
  if (!appUser.agency) {
    throw new Error("Agency context is required");
  }

  const { agency, supabase } = appUser;
  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select(
      "id, candidate_introduction_id, status, confidence, current_score, score_band, assigned_to_user_id, created_at, last_activity_at, research_status, researched_at",
    )
    .eq("agency_id", agency.agencyId)
    .eq("id", caseId)
    .maybeSingle();

  if (caseError) {
    throw new Error(caseError.message);
  }

  if (!caseRow) {
    notFound();
  }

  const typedCaseRow = caseRow as {
    assigned_to_user_id: string | null;
    candidate_introduction_id: string;
    confidence: CaseDetailRow["confidence"];
    created_at: string;
    current_score: number;
    id: string;
    last_activity_at: string;
    researched_at: string | null;
    research_status: CaseDetailRow["research_status"];
    score_band: CaseDetailRow["score_band"];
    status: CaseDetailRow["status"];
  };
  const adminClient = createAdminClient();
  const [
    { data: introductionRow, error: introductionError },
    { data: noteRows, error: notesError },
    { data: membershipRows, error: membershipError },
    { data: evidenceRows, error: evidenceError },
    { data: scoreEventRows, error: scoreEventsError },
    { data: checkRows, error: checksError },
    { data: outreachRows, error: outreachError },
  ] = await Promise.all([
    supabase
      .from("candidate_introductions")
      .select(
        "candidate_full_name, candidate_linkedin_url, candidate_location, client_company_raw, client_website, fee_term_reference, introduced_role_raw, notes, recruiter_name, submission_date",
      )
      .eq("agency_id", agency.agencyId)
      .eq("id", typedCaseRow.candidate_introduction_id)
      .maybeSingle(),
    supabase
      .from("case_notes")
      .select("id, author_user_id, body, created_at")
      .eq("agency_id", agency.agencyId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("agency_memberships")
      .select("user_id, role")
      .eq("agency_id", agency.agencyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("case_evidence")
      .select(
        "id, evidence_type, strength, summary_text, source_url, snippet_text, attachment_filename, attachment_bucket, attachment_path, score_delta, created_at, created_by_user_id",
      )
      .eq("agency_id", agency.agencyId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("case_score_events")
      .select("id, rule_key, delta, explanation, created_at")
      .eq("agency_id", agency.agencyId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("case_checks")
      .select("id, check_type, status, completed_at, error_text, source_url, result_json")
      .eq("agency_id", agency.agencyId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("outreach_messages")
      .select(
        "id, recipient_email, subject, body_markdown, status, resend_email_id, sent_at, error_text, created_at",
      )
      .eq("agency_id", agency.agencyId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false }),
  ]);

  if (introductionError) {
    throw new Error(introductionError.message);
  }

  if (!introductionRow) {
    notFound();
  }

  if (
    notesError ||
    membershipError ||
    evidenceError ||
    scoreEventsError ||
    checksError ||
    outreachError
  ) {
    throw new Error(
      notesError?.message ??
        membershipError?.message ??
        evidenceError?.message ??
        scoreEventsError?.message ??
        checksError?.message ??
        outreachError?.message,
    );
  }

  const profileIds = Array.from(
    new Set(
      [
        typedCaseRow.assigned_to_user_id,
        ...(((noteRows as { author_user_id: string }[] | null) ?? []).map((row) => row.author_user_id)),
        ...(((membershipRows as { user_id: string }[] | null) ?? []).map((row) => row.user_id)),
        ...(((evidenceRows as { created_by_user_id: string }[] | null) ?? []).map(
          (row) => row.created_by_user_id,
        )),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const { data: profileRows, error: profilesError } = profileIds.length
    ? await adminClient
        .from("profiles")
        .select("id, email, full_name, first_name, last_name")
        .in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profileMap = new Map(
    (((profileRows as
      | {
          email: string | null;
          first_name: string | null;
          full_name: string | null;
          id: string;
          last_name: string | null;
        }[]
      | null) ?? [])).map((row) => {
      const derivedName =
        row.full_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Unknown user";

      return [
        row.id,
        {
          email: row.email,
          name: derivedName,
        },
      ];
    }),
  );

  const storagePaths = (((evidenceRows as
    | {
        attachment_bucket: string | null;
        attachment_path: string | null;
      }[]
    | null) ?? [])).filter(
    (row): row is { attachment_bucket: string; attachment_path: string } =>
      Boolean(row.attachment_bucket && row.attachment_path),
  );

  const signedUrlResults = await Promise.all(
    storagePaths.map(async (row) => {
      const { data } = await adminClient.storage
        .from(row.attachment_bucket)
        .createSignedUrl(row.attachment_path, 60 * 10);

      return [`${row.attachment_bucket}:${row.attachment_path}`, data?.signedUrl ?? null] as const;
    }),
  );
  const signedUrlMap = new Map(signedUrlResults);

  const caseItem: CaseDetailRow = {
    assigned_to_user_id: typedCaseRow.assigned_to_user_id,
    assigned_to_user_name: typedCaseRow.assigned_to_user_id
      ? (profileMap.get(typedCaseRow.assigned_to_user_id)?.name ?? "Unknown user")
      : null,
    candidate_full_name: introductionRow.candidate_full_name,
    candidate_linkedin_url: introductionRow.candidate_linkedin_url,
    candidate_location: introductionRow.candidate_location,
    client_company_raw: introductionRow.client_company_raw,
    client_website: introductionRow.client_website,
    confidence: typedCaseRow.score_band,
    created_at: typedCaseRow.created_at,
    current_score: typedCaseRow.current_score,
    fee_term_reference: introductionRow.fee_term_reference,
    id: typedCaseRow.id,
    introduced_role_raw: introductionRow.introduced_role_raw,
    last_activity_at: typedCaseRow.last_activity_at,
    notes: introductionRow.notes,
    completed_check_count: (((checkRows as { status: string }[] | null) ?? []).filter(
      (row) => row.status === "completed" || row.status === "skipped",
    ).length),
    failed_check_count: (((checkRows as { status: string }[] | null) ?? []).filter(
      (row) => row.status === "failed",
    ).length),
    pending_check_count: (((checkRows as { status: string }[] | null) ?? []).filter(
      (row) => row.status === "pending" || row.status === "processing",
    ).length),
    recruiter_name: introductionRow.recruiter_name,
    researched_at: typedCaseRow.researched_at,
    research_status: typedCaseRow.research_status,
    score_band: typedCaseRow.score_band,
    status: typedCaseRow.status,
    submission_date: introductionRow.submission_date,
  };
  const notes: CaseNoteRow[] =
    (((noteRows as
      | {
          author_user_id: string;
          body: string;
          created_at: string;
          id: string;
        }[]
      | null) ?? [])).map((row) => ({
      author_name: profileMap.get(row.author_user_id)?.name ?? "Unknown user",
      author_user_id: row.author_user_id,
      body: row.body,
      created_at: row.created_at,
      id: row.id,
    }));
  const assignees: CaseAssigneeOption[] =
    (((membershipRows as
      | {
          role: CaseAssigneeOption["role"];
          user_id: string;
        }[]
      | null) ?? [])).map((row) => ({
      email: profileMap.get(row.user_id)?.email ?? null,
      name: profileMap.get(row.user_id)?.name ?? "Unknown user",
      role: row.role,
      user_id: row.user_id,
    }));
  const evidenceItems: CaseEvidenceRow[] =
    (((evidenceRows as
      | {
          attachment_bucket: string | null;
          attachment_filename: string | null;
          attachment_path: string | null;
          created_at: string;
          created_by_user_id: string;
          evidence_type: CaseEvidenceRow["evidence_type"];
          id: string;
          score_delta: number;
          snippet_text: string | null;
          source_url: string | null;
          strength: CaseEvidenceRow["strength"];
          summary_text: string;
        }[]
      | null) ?? [])).map((row) => ({
      attachment_filename: row.attachment_filename,
      attachment_signed_url:
        row.attachment_bucket && row.attachment_path
          ? (signedUrlMap.get(`${row.attachment_bucket}:${row.attachment_path}`) ?? null)
          : null,
      created_at: row.created_at,
      created_by_name: profileMap.get(row.created_by_user_id)?.name ?? "Unknown user",
      evidence_type: row.evidence_type,
      id: row.id,
      score_delta: row.score_delta,
      snippet_text: row.snippet_text,
      source_url: row.source_url,
      strength: row.strength,
      summary_text: row.summary_text,
    }));
  const scoreEvents: CaseScoreEventRow[] =
    (((scoreEventRows as
      | {
          created_at: string;
          delta: number;
          explanation: string;
          id: string;
          rule_key: string;
        }[]
      | null) ?? [])).map((row) => ({
      created_at: row.created_at,
      delta: row.delta,
      explanation: row.explanation,
      id: row.id,
      rule_key: row.rule_key,
    }));
  const checks: CaseCheckRow[] =
    (((checkRows as
      | {
          check_type: CaseCheckRow["check_type"];
          completed_at: string | null;
          error_text: string | null;
          id: string;
          result_json: {
            snippet?: string;
          } | null;
          source_url: string | null;
          status: CaseCheckRow["status"];
        }[]
      | null) ?? [])).map((row) => ({
      check_type: row.check_type,
      completed_at: row.completed_at,
      error_text: row.error_text,
      id: row.id,
      result_summary:
        typeof row.result_json?.snippet === "string" ? row.result_json.snippet : null,
      source_url: row.source_url,
      status: row.status,
    }));
  const outreachMessages: OutreachMessageRow[] =
    (((outreachRows as
      | {
          body_markdown: string;
          created_at: string;
          error_text: string | null;
          id: string;
          recipient_email: string | null;
          resend_email_id: string | null;
          sent_at: string | null;
          status: OutreachMessageRow["status"];
          subject: string;
        }[]
      | null) ?? [])).map((row) => ({
      body_markdown: row.body_markdown,
      created_at: row.created_at,
      error_text: row.error_text,
      id: row.id,
      recipient_email: row.recipient_email,
      resend_email_id: row.resend_email_id,
      sent_at: row.sent_at,
      status: row.status,
      subject: row.subject,
    }));
  const timeline: CaseTimelineItem[] = [
    ...notes.map((note) => ({
      body: note.body,
      created_at: note.created_at,
      id: `note-${note.id}`,
      kind: "note" as const,
      title: note.author_name ? `Note from ${note.author_name}` : "Case note",
    })),
    ...evidenceItems.map((item) => ({
      body: [
        item.summary_text,
        item.source_url ? `Source: ${item.source_url}` : null,
        item.attachment_filename ? `Attachment: ${item.attachment_filename}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      created_at: item.created_at,
      id: `evidence-${item.id}`,
      kind: "evidence" as const,
      title: `${item.created_by_name ?? "Unknown user"} added ${item.evidence_type.replaceAll("_", " ")}`,
    })),
    ...scoreEvents.map((event) => ({
      body: `${event.delta >= 0 ? "+" : ""}${event.delta} points\n${event.explanation}`,
      created_at: event.created_at,
      id: `score-${event.id}`,
      kind: "score" as const,
      title: "Score recalculated",
    })),
    ...outreachMessages.map((message) => ({
      body: [
        `Status: ${message.status.toUpperCase()}`,
        `Subject: ${message.subject}`,
        `Recipient: ${message.recipient_email ?? "Not set"}`,
        message.sent_at ? `Sent: ${message.sent_at}` : null,
        message.error_text ? `Error: ${message.error_text}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      created_at: message.sent_at ?? message.created_at,
      id: `outreach-${message.id}`,
      kind: "outreach" as const,
      title: "Outreach activity",
    })),
  ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  return {
    assignees,
    caseItem,
    checks,
    evidenceItems,
    notes,
    outreachMessages,
    scoreEvents,
    timeline,
  };
}
