import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppUser } from "@/lib/features/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

const createAdminUserSchema = z.object({
  email: z.email(),
  firstName: z.string().trim().max(100).optional().default(""),
  lastName: z.string().trim().max(100).optional().default(""),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["member", "super_admin"]),
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
    const { email, firstName, lastName, password, role } = parsedPayload.data;
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

    return NextResponse.json({
      success: true,
      user: {
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
