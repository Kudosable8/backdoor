import { NextResponse } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";
import {
  MANUAL_CASE_EVIDENCE_TYPES,
  getScoreRule,
  type CaseEvidenceStrength,
  type CaseEvidenceType,
} from "@/lib/features/cases/scoring";
import { recalculateCaseScore } from "@/lib/features/cases/research";
import { createAdminClient } from "@/lib/supabase/admin";

const metadataSchema = z.object({
  evidenceType: z.enum([
    ...MANUAL_CASE_EVIDENCE_TYPES,
  ]),
  snippetText: z.string().trim().max(5000).optional().or(z.literal("")),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  strength: z.enum(["weak", "medium", "strong", "conflicting"]),
  summaryText: z.string().trim().min(1, "Summary is required").max(2000),
});

function getSourceDomain(sourceUrl: string | null) {
  if (!sourceUrl) {
    return null;
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);
  const { caseId } = await context.params;
  const formData = await request.formData();
  const parsedMetadata = metadataSchema.safeParse({
    evidenceType: formData.get("evidenceType"),
    snippetText: formData.get("snippetText"),
    sourceUrl: formData.get("sourceUrl"),
    strength: formData.get("strength"),
    summaryText: formData.get("summaryText"),
  });

  if (!parsedMetadata.success) {
    return NextResponse.json(
      { error: parsedMetadata.error.issues[0]?.message ?? "Invalid evidence payload" },
      { status: 400 },
    );
  }

  const { data: caseRow, error: caseError } = await appUser.supabase
    .from("cases")
    .select("id")
    .eq("agency_id", appUser.agency.agencyId)
    .eq("id", caseId)
    .maybeSingle();

  if (caseError || !caseRow) {
    return NextResponse.json({ error: caseError?.message ?? "Case not found" }, { status: 404 });
  }

  const fileValue = formData.get("file");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  if (parsedMetadata.data.evidenceType === "uploaded_file" && !file) {
    return NextResponse.json({ error: "File evidence requires an attachment" }, { status: 400 });
  }

  let attachmentBucket: string | null = null;
  let attachmentFilename: string | null = null;
  let attachmentMimeType: string | null = null;
  let attachmentPath: string | null = null;
  let attachmentSizeBytes: number | null = null;

  if (file) {
    attachmentBucket = "attachments";
    attachmentFilename = file.name;
    attachmentMimeType = file.type || "application/octet-stream";
    attachmentPath = `${appUser.agency.agencyId}/cases/${caseId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    attachmentSizeBytes = file.size;

    const adminClient = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await adminClient.storage
      .from(attachmentBucket)
      .upload(attachmentPath, arrayBuffer, {
        contentType: attachmentMimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }
  }

  const rule = getScoreRule(
    parsedMetadata.data.evidenceType as CaseEvidenceType,
    parsedMetadata.data.strength as CaseEvidenceStrength,
  );
  const { data: insertedEvidence, error: evidenceError } = await appUser.supabase
    .from("case_evidence")
    .insert({
      agency_id: appUser.agency.agencyId,
      attachment_bucket: attachmentBucket,
      attachment_filename: attachmentFilename,
      attachment_mime_type: attachmentMimeType,
      attachment_path: attachmentPath,
      attachment_size_bytes: attachmentSizeBytes,
      case_id: caseId,
      created_by_user_id: appUser.user.id,
      evidence_type: parsedMetadata.data.evidenceType,
      score_delta: rule.delta,
      snippet_text: parsedMetadata.data.snippetText || null,
      source_domain: getSourceDomain(parsedMetadata.data.sourceUrl || null),
      source_url: parsedMetadata.data.sourceUrl || null,
      strength: parsedMetadata.data.strength,
      summary_text: parsedMetadata.data.summaryText,
    })
    .select("id")
    .single();

  if (evidenceError || !insertedEvidence) {
    return NextResponse.json(
      { error: evidenceError?.message ?? "Unable to save evidence" },
      { status: 400 },
    );
  }

  const { error: scoreEventError } = await appUser.supabase.from("case_score_events").insert({
    agency_id: appUser.agency.agencyId,
    case_id: caseId,
    delta: rule.delta,
    evidence_item_id: insertedEvidence.id,
    explanation: rule.explanation,
    rule_key: rule.ruleKey,
  });

  if (scoreEventError) {
    return NextResponse.json({ error: scoreEventError.message }, { status: 400 });
  }

  let scoreBand: "low" | "medium" | "high";

  try {
    const recalculated = await recalculateCaseScore({
      agencyId: appUser.agency.agencyId,
      caseId,
      supabase: appUser.supabase,
    });
    scoreBand = recalculated.scoreBand;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to recalculate case score" },
      { status: 400 },
    );
  }

  await logAuditEvent({
    action: "created",
    appUser,
    entityId: insertedEvidence.id,
    entityType: "case_evidence",
    metadata: {
      caseId,
      evidenceType: parsedMetadata.data.evidenceType,
      hasAttachment: Boolean(file),
      scoreBand,
      scoreDelta: rule.delta,
      strength: parsedMetadata.data.strength,
    },
  });

  return NextResponse.json({ success: true });
}
