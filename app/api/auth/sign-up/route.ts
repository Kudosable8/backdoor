import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AgencyRole } from "@/lib/features/auth/types";

const inviteLookupSchema = z.object({
  token: z.string().trim().min(1, "Invite token is required"),
});

const signUpSchema = z
  .object({
    token: z.string().trim().min(1, "Invite token is required"),
    email: z.email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    repeatPassword: z.string().min(1, "Repeat password is required"),
  })
  .refine((data) => data.password === data.repeatPassword, {
    path: ["repeatPassword"],
    message: "Passwords do not match",
  });

type InviteRecord = {
  accepted_at: string | null;
  agency_id: string;
  email: string;
  expires_at: string;
  role: AgencyRole;
  agencies: {
    name: string;
  } | null;
};

function isInviteExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}

async function getInviteByToken(token: string) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("agency_invites")
    .select("accepted_at, agency_id, email, expires_at, role, agencies(name)")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as InviteRecord | null) ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedQuery = inviteLookupSchema.safeParse({
    token: searchParams.get("token"),
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: parsedQuery.error.issues[0]?.message ?? "Invalid invite lookup" },
      { status: 400 },
    );
  }

  try {
    const invite = await getInviteByToken(parsedQuery.data.token);

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    return NextResponse.json({
      agencyName: invite.agencies?.name ?? "Agency",
      email: invite.email,
      isAccepted: Boolean(invite.accepted_at),
      isExpired: isInviteExpired(invite.expires_at),
      role: invite.role,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load invite";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsedPayload = signUpSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid sign-up request" },
      { status: 400 },
    );
  }

  try {
    const invite = await getInviteByToken(parsedPayload.data.token);

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { error: "This invite has already been accepted" },
        { status: 409 },
      );
    }

    if (isInviteExpired(invite.expires_at)) {
      return NextResponse.json(
        { error: "This invite has expired" },
        { status: 410 },
      );
    }

    if (invite.email.toLowerCase() !== parsedPayload.data.email.toLowerCase()) {
      return NextResponse.json(
        { error: "This invite only applies to the invited email address" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const origin = new URL(request.url).origin;
    const { data, error } = await supabase.auth.signUp({
      email: parsedPayload.data.email,
      password: parsedPayload.data.password,
      options: {
        emailRedirectTo: `${origin}/dashboard`,
      },
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to create account" },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const { error: membershipError } = await adminClient
      .from("agency_memberships")
      .upsert({
        agency_id: invite.agency_id,
        user_id: data.user.id,
        role: invite.role,
      });

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }

    const { error: inviteUpdateError } = await adminClient
      .from("agency_invites")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_user_id: data.user.id,
      })
      .eq("token", parsedPayload.data.token);

    if (inviteUpdateError) {
      return NextResponse.json({ error: inviteUpdateError.message }, { status: 400 });
    }

    await adminClient.from("audit_events").insert({
      action: "updated",
      actor_user_id: data.user.id,
      agency_id: invite.agency_id,
      entity_type: "agency_invite",
      metadata_json: {
        acceptedEmail: parsedPayload.data.email.toLowerCase(),
        role: invite.role,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create account";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
