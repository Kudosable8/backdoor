import { NextResponse } from "next/server";

import { getAppUser } from "@/lib/features/auth/server";
import {
  createImpersonationSession,
  setImpersonationCookie,
} from "@/lib/features/admin/impersonation";
import { logAuditEvent } from "@/lib/features/audit/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const appUser = await getAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!appUser.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;

  if (userId === appUser.user.id) {
    return NextResponse.json(
      { error: "Use your normal session instead of impersonating yourself." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  const [{ data: authUserData, error: authUserError }, { data: agencyMembership }] =
    await Promise.all([
      adminClient.auth.admin.getUserById(userId),
      adminClient
        .from("agency_memberships")
        .select("agency_id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (authUserError || !authUserData.user?.email) {
    return NextResponse.json(
      { error: authUserError?.message ?? "Target user not found" },
      { status: 404 },
    );
  }

  const impersonationSession = await createImpersonationSession({
    superAdminUserId: appUser.user.id,
    targetUserId: userId,
  });
  await setImpersonationCookie(
    impersonationSession.id,
    impersonationSession.expires_at,
  );

  const origin = new URL(request.url).origin;
  const { data: generatedLink, error: generateLinkError } =
    await adminClient.auth.admin.generateLink({
      email: authUserData.user.email,
      options: {
        redirectTo: `${origin}/dashboard`,
      },
      type: "magiclink",
    });

  if (
    generateLinkError ||
    !generatedLink.properties.hashed_token ||
    !generatedLink.properties.verification_type
  ) {
    return NextResponse.json(
      { error: generateLinkError?.message ?? "Unable to create impersonation link" },
      { status: 400 },
    );
  }
  const actionLink = `${origin}/auth/confirm?token_hash=${encodeURIComponent(
    generatedLink.properties.hashed_token,
  )}&type=${encodeURIComponent(
    generatedLink.properties.verification_type,
  )}&next=${encodeURIComponent("/dashboard")}`;

  if (agencyMembership?.agency_id) {
    await logAuditEvent({
      action: "created",
      appUser: {
        ...appUser,
        agency: {
          agencyId: agencyMembership.agency_id,
          agencyName: appUser.agency?.agencyName ?? "Impersonated Agency",
          agencySlug: appUser.agency?.agencySlug ?? "impersonated-agency",
          role: appUser.agency?.role ?? "owner",
        },
      },
      entityId: impersonationSession.id,
      entityType: "admin_impersonation_session",
      metadata: {
        superAdminUserId: appUser.user.id,
        targetUserEmail: authUserData.user.email,
        targetUserId: userId,
      },
    });
  }

  return NextResponse.json({
    actionLink,
    success: true,
  });
}
