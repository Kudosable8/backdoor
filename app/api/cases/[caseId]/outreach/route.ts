import { NextResponse } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";
import { buildOutreachDraft } from "@/lib/features/cases/export";
import { getCaseDetailData } from "@/lib/features/cases/server";

const outreachSchema = z.object({
  bodyMarkdown: z.string().trim().min(1).optional(),
  recipientEmail: z.string().trim().email().optional().or(z.literal("")),
  subject: z.string().trim().min(1).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);
  const { caseId } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsedPayload = outreachSchema.safeParse(payload ?? {});

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid outreach draft" },
      { status: 400 },
    );
  }

  const caseData = await getCaseDetailData({ appUser, caseId });
  const generatedDraft = buildOutreachDraft({
    caseItem: caseData.caseItem,
    evidenceItems: caseData.evidenceItems,
  });
  const { data: outreachRow, error } = await appUser.supabase.from("outreach_messages").insert({
    agency_id: appUser.agency.agencyId,
    body_markdown: parsedPayload.data.bodyMarkdown ?? generatedDraft.bodyMarkdown,
    case_id: caseId,
    created_by_user_id: appUser.user.id,
    recipient_email: parsedPayload.data.recipientEmail || generatedDraft.recipientEmail || null,
    status: "draft",
    subject: parsedPayload.data.subject ?? generatedDraft.subject,
  }).select("id").single();

  if (error || !outreachRow) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await appUser.supabase
    .from("cases")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("agency_id", appUser.agency.agencyId)
    .eq("id", caseId);

  await logAuditEvent({
    action: "drafted",
    appUser,
    entityId: outreachRow.id,
    entityType: "outreach_message",
    metadata: {
      caseId,
      recipientEmail: parsedPayload.data.recipientEmail || generatedDraft.recipientEmail || null,
      subject: parsedPayload.data.subject ?? generatedDraft.subject,
    },
  });

  return NextResponse.json({ success: true });
}
