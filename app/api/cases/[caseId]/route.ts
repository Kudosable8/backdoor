import { NextResponse } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";

const updateCaseSchema = z.object({
  assignedToUserId: z.string().uuid().nullable().optional(),
  status: z
    .enum([
      "new",
      "reviewing",
      "needs_more_evidence",
      "ready_to_contact",
      "contacted",
      "won",
      "lost",
      "dismissed",
    ])
    .optional(),
});

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter", "finance"]);
  const payload = await request.json().catch(() => null);
  const parsedPayload = updateCaseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid case update" },
      { status: 400 },
    );
  }

  const { caseId } = await context.params;
  const updatePayload = {
    ...(parsedPayload.data.assignedToUserId !== undefined
      ? { assigned_to_user_id: parsedPayload.data.assignedToUserId }
      : {}),
    ...(parsedPayload.data.status
      ? {
          closed_at:
            parsedPayload.data.status === "dismissed" ? new Date().toISOString() : null,
          confirmed_at:
            parsedPayload.data.status === "ready_to_contact"
              ? new Date().toISOString()
              : null,
          last_activity_at: new Date().toISOString(),
          status: parsedPayload.data.status,
        }
      : {}),
  };

  const { error } = await appUser.supabase
    .from("cases")
    .update(updatePayload)
    .eq("id", caseId)
    .eq("agency_id", appUser.agency.agencyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "updated",
    appUser,
    entityId: caseId,
    entityType: "case",
    metadata: {
      assignedToUserId: parsedPayload.data.assignedToUserId ?? undefined,
      status: parsedPayload.data.status ?? undefined,
    },
  });

  return NextResponse.json({ success: true });
}
