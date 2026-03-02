import { NextResponse } from "next/server";

import { getAppUser } from "@/lib/features/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
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
      { error: "You cannot delete your own account from this screen." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
