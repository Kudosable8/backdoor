import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppUser } from "@/lib/features/auth/server";
import { agencyRoleLabels } from "@/lib/features/auth/types";
import { sendAgencyInviteEmail } from "@/lib/resend/invites";
import { createAdminClient } from "@/lib/supabase/admin";

const createAgencySchema = z.object({
  mode: z.enum(["existing_user", "invite_owner"]),
  name: z.string().trim().min(1, "Agency name is required").max(120),
  ownerEmail: z.email(),
  slug: z
    .string()
    .trim()
    .min(2, "Slug is required")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
});

function createErrorResponse(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const appUser = await getAppUser();

  if (!appUser) {
    return createErrorResponse("Unauthorized", 401);
  }

  if (!appUser.isSuperAdmin) {
    return createErrorResponse("Forbidden", 403);
  }

  const payload = await request.json().catch(() => null);
  const parsedPayload = createAgencySchema.safeParse(payload);

  if (!parsedPayload.success) {
    return createErrorResponse(
      parsedPayload.error.issues[0]?.message ?? "Invalid agency request",
    );
  }

  const adminClient = createAdminClient();
  const { mode, name, ownerEmail, slug } = parsedPayload.data;
  const normalizedOwnerEmail = ownerEmail.toLowerCase();

  const { data: createdAgency, error: agencyError } = await appUser.supabase
    .from("agencies")
    .insert({
      created_by: appUser.user.id,
      name,
      slug,
    })
    .select("id, name, slug")
    .single();

  if (agencyError || !createdAgency) {
    const message = agencyError?.message?.toLowerCase() ?? "";

    if (message.includes("agencies_slug_key")) {
      return createErrorResponse("That agency slug is already in use.", 409);
    }

    return createErrorResponse(agencyError?.message ?? "Unable to create agency");
  }

  try {
    if (mode === "existing_user") {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, email")
        .ilike("email", normalizedOwnerEmail)
        .maybeSingle();

      if (!profile?.id) {
        await adminClient.from("agencies").delete().eq("id", createdAgency.id);
        return createErrorResponse(
          "No existing user was found for that owner email address.",
          404,
        );
      }

      const { error: membershipError } = await appUser.supabase
        .from("agency_memberships")
        .insert({
          agency_id: createdAgency.id,
          role: "owner",
          user_id: profile.id,
        });

      if (membershipError) {
        await adminClient.from("agencies").delete().eq("id", createdAgency.id);
        return createErrorResponse(membershipError.message);
      }

      return NextResponse.json({
        agency: createdAgency,
        ownerEmail: normalizedOwnerEmail,
        success: true,
      });
    }

    const inviteToken = crypto.randomUUID();
    const origin = new URL(request.url).origin;
    const inviteUrl = `${origin}/auth/sign-up?invite=${inviteToken}`;
    const { error: inviteError } = await adminClient.from("agency_invites").insert({
      agency_id: createdAgency.id,
      email: normalizedOwnerEmail,
      invited_by: appUser.user.id,
      role: "owner",
      token: inviteToken,
    });

    if (inviteError) {
      await adminClient.from("agencies").delete().eq("id", createdAgency.id);
      return createErrorResponse(inviteError.message);
    }

    try {
      await sendAgencyInviteEmail({
        agencyName: createdAgency.name,
        inviteUrl,
        roleLabel: agencyRoleLabels.owner,
        toEmail: normalizedOwnerEmail,
      });
    } catch (error) {
      await adminClient.from("agency_invites").delete().eq("token", inviteToken);
      await adminClient.from("agencies").delete().eq("id", createdAgency.id);

      return createErrorResponse(
        error instanceof Error ? error.message : "Unable to send owner invite email",
        500,
      );
    }

    return NextResponse.json({
      agency: createdAgency,
      inviteUrl,
      emailSent: true,
      ownerEmail: normalizedOwnerEmail,
      success: true,
    });
  } catch (error) {
    await adminClient.from("agencies").delete().eq("id", createdAgency.id);
    return createErrorResponse(
      error instanceof Error ? error.message : "Unable to create agency",
      500,
    );
  }
}
