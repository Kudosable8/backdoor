import { NextResponse } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";

const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Note body is required"),
});

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);
  const payload = await request.json().catch(() => null);
  const parsedPayload = createNoteSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid note request" },
      { status: 400 },
    );
  }

  const { caseId } = await context.params;
  const { error: noteError } = await appUser.supabase.from("case_notes").insert({
    agency_id: appUser.agency.agencyId,
    author_user_id: appUser.user.id,
    body: parsedPayload.data.body,
    case_id: caseId,
  });

  if (noteError) {
    return NextResponse.json({ error: noteError.message }, { status: 400 });
  }

  const { error: caseError } = await appUser.supabase
    .from("cases")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", caseId)
    .eq("agency_id", appUser.agency.agencyId);

  if (caseError) {
    return NextResponse.json({ error: caseError.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "created",
    appUser,
    entityType: "case_note",
    metadata: {
      caseId,
      length: parsedPayload.data.body.length,
    },
  });

  return NextResponse.json({ success: true });
}
