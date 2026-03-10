import { NextResponse } from "next/server";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";
import { sendEmailWithResend } from "@/lib/resend/client";

function markdownToHtml(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ caseId: string; messageId: string }> },
) {
  const appUser = await requireAgencyRole(["owner", "manager", "finance"]);
  const { caseId, messageId } = await context.params;
  const { data: messageRow, error: messageError } = await appUser.supabase
    .from("outreach_messages")
    .select("id, recipient_email, subject, body_markdown, status")
    .eq("agency_id", appUser.agency.agencyId)
    .eq("case_id", caseId)
    .eq("id", messageId)
    .maybeSingle();

  if (messageError || !messageRow) {
    return NextResponse.json(
      { error: messageError?.message ?? "Outreach draft not found" },
      { status: 404 },
    );
  }

  if (!messageRow.recipient_email) {
    return NextResponse.json(
      { error: "Recipient email is required before sending outreach" },
      { status: 400 },
    );
  }

  if (messageRow.status === "sent") {
    return NextResponse.json({ error: "Outreach message has already been sent" }, { status: 400 });
  }

  try {
    const resendResponse = await sendEmailWithResend({
      html: markdownToHtml(messageRow.body_markdown),
      replyTo: process.env.RESEND_REPLY_TO_EMAIL ?? null,
      subject: messageRow.subject,
      text: messageRow.body_markdown,
      to: messageRow.recipient_email,
    });

    const now = new Date().toISOString();
    const [{ error: updateMessageError }, { error: updateCaseError }] = await Promise.all([
      appUser.supabase
        .from("outreach_messages")
        .update({
          error_text: null,
          resend_email_id: resendResponse.id,
          sent_at: now,
          status: "sent",
        })
        .eq("agency_id", appUser.agency.agencyId)
        .eq("id", messageId),
      appUser.supabase
        .from("cases")
        .update({
          last_activity_at: now,
          status: "contacted",
        })
        .eq("agency_id", appUser.agency.agencyId)
        .eq("id", caseId),
    ]);

    if (updateMessageError || updateCaseError) {
      return NextResponse.json(
        { error: updateMessageError?.message ?? updateCaseError?.message ?? "Unable to store send result" },
        { status: 400 },
      );
    }

    await logAuditEvent({
      action: "sent",
      appUser,
      entityId: messageId,
      entityType: "outreach_message",
      metadata: {
        caseId,
        recipientEmail: messageRow.recipient_email,
        resendEmailId: resendResponse.id,
        subject: messageRow.subject,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unable to send outreach email";

    await appUser.supabase
      .from("outreach_messages")
      .update({
        error_text: errorMessage,
        status: "failed",
      })
      .eq("agency_id", appUser.agency.agencyId)
      .eq("id", messageId);

    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
