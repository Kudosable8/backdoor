import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppUser } from "@/lib/features/auth/server";
import { logAuditEvent } from "@/lib/features/audit/server";
import { createAdminClient } from "@/lib/supabase/admin";

const createAdminUserSchema = z.object({
  agencyId: z.string().uuid().optional().nullable(),
  agencyRole: z.enum(["owner", "manager", "recruiter", "finance", "read_only"]).optional().nullable(),
  email: z.email(),
  firstName: z.string().trim().max(100).optional().default(""),
  lastName: z.string().trim().max(100).optional().default(""),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["member", "super_admin"]),
}).superRefine((data, ctx) => {
  if (data.agencyId && !data.agencyRole) {
    ctx.addIssue({
      code: "custom",
      message: "Agency role is required when assigning an agency membership",
      path: ["agencyRole"],
    });
  }

  if (!data.agencyId && data.agencyRole) {
    ctx.addIssue({
      code: "custom",
      message: "Choose an agency before assigning an agency role",
      path: ["agencyId"],
    });
  }
});

function createErrorResponse(error: string, hint?: string, status = 400) {
  return NextResponse.json({ error, hint }, { status });
}

export async function POST(request: Request) {
  try {
    const appUser = await getAppUser();

    if (!appUser) {
      return createErrorResponse("Unauthorized", undefined, 401);
    }

    if (!appUser.isSuperAdmin) {
      return createErrorResponse("Forbidden", undefined, 403);
    }

    const payload = await request.json().catch(() => null);
    const parsedPayload = createAdminUserSchema.safeParse(payload);

    if (!parsedPayload.success) {
      const issue = parsedPayload.error.issues[0];

      return createErrorResponse(issue?.message ?? "Invalid request");
    }

    const adminClient = createAdminClient();
    const { agencyId, agencyRole, email, firstName, lastName, password, role } = parsedPayload.data;
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    const { data: createdUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !createdUser.user) {
      if (createError?.message?.toLowerCase().includes("already been registered")) {
        return createErrorResponse(
          "That email address is already registered.",
          "Use a different email or change the existing user's role.",
        );
      }

      return createErrorResponse(createError?.message ?? "Unable to create user");
    }

    const userId = createdUser.user.id;

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: userId,
      email,
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName || null,
    });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId);
      return createErrorResponse(
        profileError.message,
        "Check that the latest database migrations have been applied.",
      );
    }

    if (role === "super_admin") {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .upsert({ user_id: userId, role: "super_admin" });

      if (roleError) {
        await adminClient.auth.admin.deleteUser(userId);
        return createErrorResponse(
          roleError.message,
          "Check that the latest database migrations have been applied.",
        );
      }
    }

    if (agencyId && agencyRole) {
      const [{ data: agencyRow, error: agencyError }, { data: existingOwner, error: ownerError }] =
        await Promise.all([
          adminClient.from("agencies").select("id, name").eq("id", agencyId).maybeSingle(),
          agencyRole === "owner"
            ? adminClient
                .from("agency_memberships")
                .select("user_id")
                .eq("agency_id", agencyId)
                .eq("role", "owner")
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

      if (agencyError || !agencyRow) {
        await adminClient.auth.admin.deleteUser(userId);
        return createErrorResponse(
          agencyError?.message ?? "Selected agency was not found.",
        );
      }

      if (ownerError) {
        await adminClient.auth.admin.deleteUser(userId);
        return createErrorResponse(ownerError.message);
      }

      if (existingOwner) {
        await adminClient.auth.admin.deleteUser(userId);
        return createErrorResponse(
          "That agency already has an owner. Use a non-owner role or reassign ownership separately.",
        );
      }

      const { error: membershipError } = await adminClient
        .from("agency_memberships")
        .insert({
          agency_id: agencyId,
          role: agencyRole,
          user_id: userId,
        });

      if (membershipError) {
        await adminClient.auth.admin.deleteUser(userId);
        return createErrorResponse(
          membershipError.message,
          "Check single-agency-per-user constraints and current agency ownership.",
        );
      }

      await logAuditEvent({
        action: "created",
        appUser,
        entityId: userId,
        entityType: "agency_membership",
        metadata: {
          agencyId,
          agencyName: agencyRow.name,
          agencyRole,
          email,
          source: "super_admin_user_creation",
        },
      });
    }

    return NextResponse.json({
      success: true,
      user: {
        agency_id: agencyId ?? null,
        agency_role: agencyRole ?? null,
        id: userId,
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        role,
        last_signed_in_at: null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create user";

    if (message.includes("SUPABASE_SECRET_KEY")) {
      return createErrorResponse(
        "Admin user creation is not configured.",
        "Add SUPABASE_SECRET_KEY to .env.local and restart the app.",
        500,
      );
    }

    return createErrorResponse(message, undefined, 500);
  }
}
