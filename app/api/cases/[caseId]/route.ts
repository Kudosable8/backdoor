import { NextResponse } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";
import { getCaseContactReadiness } from "@/lib/features/cases/research";

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

  if (parsedPayload.data.status === "ready_to_contact") {
    try {
      const readiness = await getCaseContactReadiness({
        agencyId: appUser.agency.agencyId,
        caseId,
        supabase: appUser.supabase,
      });

      if (!readiness.canContact) {
        return NextResponse.json(
          {
            error:
              readiness.scoreBand === "low"
                ? "This case needs stronger evidence before it can be marked ready to contact."
                : "This case needs corroborated evidence from more than public web signals before it can be marked ready to contact.",
          },
          { status: 400 },
        );
      }
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to validate contact readiness",
        },
        { status: 400 },
      );
    }
  }

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
