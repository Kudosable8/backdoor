import { NextResponse } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";
import { agencyRoleLabels, type AgencyRole } from "@/lib/features/auth/types";
import { sendAgencyInviteEmail } from "@/lib/resend/invites";

const createInviteSchema = z.object({
  email: z.email(),
  role: z.enum(["owner", "manager", "recruiter", "finance", "read_only"]),
});

const managerAssignableRoles: AgencyRole[] = ["recruiter", "finance", "read_only"];
const ownerAssignableRoles: AgencyRole[] = [
  "owner",
  "manager",
  "recruiter",
  "finance",
  "read_only",
];

export async function POST(request: Request) {
  const appUser = await requireAgencyRole(["owner", "manager"]);
  const payload = await request.json().catch(() => null);
  const parsedPayload = createInviteSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid invite request" },
      { status: 400 },
    );
  }

  if (!appUser.agency) {
    return NextResponse.json({ error: "No agency context found" }, { status: 400 });
  }

  const allowedRoles =
    appUser.agency.role === "owner" ? ownerAssignableRoles : managerAssignableRoles;

  if (!allowedRoles.includes(parsedPayload.data.role)) {
    return NextResponse.json(
      { error: "You do not have permission to invite that role" },
      { status: 403 },
    );
  }

  const inviteToken = crypto.randomUUID();
  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/auth/sign-up?invite=${inviteToken}`;
  const { error } = await appUser.supabase.from("agency_invites").insert({
    agency_id: appUser.agency.agencyId,
    email: parsedPayload.data.email.toLowerCase(),
    invited_by: appUser.user.id,
    role: parsedPayload.data.role,
    token: inviteToken,
  });

  if (error) {
    const message = error.message.toLowerCase();

    if (message.includes("agency_invites_agency_email_active_idx")) {
      return NextResponse.json(
        { error: "There is already a pending invite for that email address." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  try {
    await sendAgencyInviteEmail({
      agencyName: appUser.agency.agencyName,
      inviteUrl,
      roleLabel: agencyRoleLabels[parsedPayload.data.role],
      toEmail: parsedPayload.data.email.toLowerCase(),
    });
  } catch (sendError) {
    await appUser.supabase.from("agency_invites").delete().eq("token", inviteToken);

    return NextResponse.json(
      {
        error:
          sendError instanceof Error
            ? sendError.message
            : "Unable to send invite email",
      },
      { status: 500 },
    );
  }

  await logAuditEvent({
    action: "created",
    appUser,
    entityType: "agency_invite",
    metadata: {
      email: parsedPayload.data.email.toLowerCase(),
      role: parsedPayload.data.role,
    },
  });

  return NextResponse.json({
    inviteUrl,
    emailSent: true,
    success: true,
  });
}
