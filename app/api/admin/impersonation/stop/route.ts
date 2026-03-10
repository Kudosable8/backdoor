import { NextResponse } from "next/server";

import { getAppUser } from "@/lib/features/auth/server";
import {
  clearImpersonationCookie,
  endImpersonationSession,
  getImpersonationContext,
} from "@/lib/features/admin/impersonation";
import { logAuditEvent } from "@/lib/features/audit/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const appUser = await getAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const impersonationContext = await getImpersonationContext();

  if (!impersonationContext) {
    return NextResponse.json(
      { error: "No active impersonation session found" },
      { status: 400 },
    );
  }

  if (impersonationContext.target_user_id !== appUser.user.id) {
    return NextResponse.json(
      { error: "Current session does not match the impersonated user" },
      { status: 403 },
    );
  }

  const adminClient = createAdminClient();
  const [{ data: superAdminAuthUser, error: superAdminError }, { data: agencyMembership }] =
    await Promise.all([
      adminClient.auth.admin.getUserById(impersonationContext.super_admin_user_id),
      adminClient
        .from("agency_memberships")
        .select("agency_id")
        .eq("user_id", impersonationContext.target_user_id)
        .maybeSingle(),
    ]);

  if (superAdminError || !superAdminAuthUser.user?.email) {
    return NextResponse.json(
      { error: superAdminError?.message ?? "Original super admin not found" },
      { status: 404 },
    );
  }

  const origin = new URL(request.url).origin;
  const { data: generatedLink, error: generateLinkError } =
    await adminClient.auth.admin.generateLink({
      email: superAdminAuthUser.user.email,
      options: {
        redirectTo: `${origin}/admin/users`,
      },
      type: "magiclink",
    });

  if (
    generateLinkError ||
    !generatedLink.properties.hashed_token ||
    !generatedLink.properties.verification_type
  ) {
    return NextResponse.json(
      { error: generateLinkError?.message ?? "Unable to create return link" },
      { status: 400 },
    );
  }
  const actionLink = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    generatedLink.properties.hashed_token,
  )}&type=${encodeURIComponent(
    generatedLink.properties.verification_type,
  )}&next=${encodeURIComponent("/admin/users")}`;

  await endImpersonationSession(impersonationContext.id);
  await clearImpersonationCookie();

  if (agencyMembership?.agency_id) {
    await logAuditEvent({
      action: "ended",
      appUser: {
        ...appUser,
        agency: {
          agencyId: agencyMembership.agency_id,
          agencyName: appUser.agency?.agencyName ?? "Impersonated Agency",
          agencySlug: appUser.agency?.agencySlug ?? "impersonated-agency",
          role: appUser.agency?.role ?? "owner",
        },
      },
      entityId: impersonationContext.id,
      entityType: "admin_impersonation_session",
      metadata: {
        returnedToSuperAdminId: impersonationContext.super_admin_user_id,
        targetUserId: impersonationContext.target_user_id,
      },
    });
  }

  return NextResponse.json({
    actionLink,
    success: true,
  });
}
