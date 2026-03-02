import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type AppProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type AppUserContext = {
  profile: AppProfile | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: {
    email: string;
    id: string;
  };
  isSuperAdmin: boolean;
};

export function getDisplayName(profile: AppProfile | null) {
  const nameFromParts = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (nameFromParts) {
    return nameFromParts;
  }

  return profile?.full_name?.trim() || "Add your name";
}

export async function getAppUser(): Promise<AppUserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const [{ data: rawProfile }, { data: roleRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const profile = (rawProfile as AppProfile | null) ?? null;
  const isSuperAdmin =
    roleRows?.some((roleRow) => roleRow.role === "super_admin") ?? false;

  return {
    profile,
    supabase,
    user: {
      email: user.email ?? "No email available",
      id: user.id,
    },
    isSuperAdmin,
  };
}

export async function requireAppUser(): Promise<AppUserContext> {
  const context = await getAppUser();

  if (!context) {
    redirect("/auth/login");
  }

  return context;
}

export async function requireSuperAdminUser() {
  const context = await requireAppUser();

  if (!context.isSuperAdmin) {
    redirect("/dashboard");
  }

  return context;
}
