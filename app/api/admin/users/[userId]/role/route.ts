import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppUser } from "@/lib/features/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

const updateRoleSchema = z.object({
  role: z.enum(["member", "super_admin"]),
});

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const appUser = await getAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!appUser.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsedPayload = updateRoleSchema.safeParse(payload);

  if (!parsedPayload.success) {
    const issue = parsedPayload.error.issues[0];

    return NextResponse.json(
      { error: issue?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { userId } = await context.params;
  const adminClient = createAdminClient();

  if (parsedPayload.data.role === "super_admin") {
    const { error } = await adminClient
      .from("user_roles")
      .upsert({ user_id: userId, role: "super_admin" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    if (userId === appUser.user.id) {
      return NextResponse.json(
        { error: "You cannot remove your own super admin role from this screen." },
        { status: 400 },
      );
    }

    const { error } = await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "super_admin");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true, role: parsedPayload.data.role });
}
