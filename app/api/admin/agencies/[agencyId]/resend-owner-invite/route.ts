import { NextResponse } from "next/server";

import { requireSuperAdminUser } from "@/lib/features/auth/server";
import { agencyRoleLabels } from "@/lib/features/auth/types";
import { sendAgencyInviteEmail } from "@/lib/resend/invites";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    agencyId: string;
  }>;
};

function createErrorResponse(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const appUser = await requireSuperAdminUser();
  const { agencyId } = await context.params;
  const adminClient = createAdminClient();

  const { data: invite, error: inviteError } = await adminClient
    .from("agency_invites")
    .select("id, agency_id, email, role, token, agencies(name)")
    .eq("agency_id", agencyId)
    .eq("role", "owner")
    .is("accepted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteError) {
    return createErrorResponse(inviteError.message, 500);
  }

  if (!invite) {
    return createErrorResponse("No pending owner invite was found for this agency.", 404);
  }

  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/auth/sign-up?invite=${invite.token}`;
  const agencyJoin = invite.agencies as { name: string }[] | { name: string } | null;
  const agencyName = Array.isArray(agencyJoin)
    ? agencyJoin[0]?.name ?? "Agency"
    : agencyJoin?.name ?? "Agency";

  try {
    await sendAgencyInviteEmail({
      agencyName,
      inviteUrl,
      roleLabel: agencyRoleLabels.owner,
      toEmail: invite.email,
    });
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : "Unable to resend owner invite email",
      500,
    );
  }

  await adminClient.from("audit_events").insert({
    action: "sent",
    actor_user_id: appUser.user.id,
    agency_id: invite.agency_id,
    entity_id: invite.id,
    entity_type: "agency_invite",
    metadata_json: {
      email: invite.email,
      resentBySuperAdmin: true,
      role: invite.role,
    },
  });

  return NextResponse.json({ success: true });
}
