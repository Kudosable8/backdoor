import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { AgencyMembership, AgencyRole, PlatformRole } from "./types";

type AppProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type AppUserContext = {
  agency: AgencyMembership | null;
  profile: AppProfile | null;
  platformRoles: PlatformRole[];
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

  const [{ data: rawProfile }, { data: roleRows }, { data: rawAgencyMembership }] =
    await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase
      .from("agency_memberships")
      .select("agency_id, role, agencies(name, slug)")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profile = (rawProfile as AppProfile | null) ?? null;
  const platformRoles =
    roleRows
      ?.map((roleRow) => roleRow.role)
      .filter((role): role is PlatformRole => role === "super_admin") ?? [];
  const isSuperAdmin = platformRoles.includes("super_admin");
  const agencyMembership =
    rawAgencyMembership as
      | {
          agencies: {
            name: string;
            slug: string;
          } | null;
          agency_id: string;
          role: AgencyRole;
        }
      | null;
  const agency =
    agencyMembership?.agencies
      ? {
          agencyId: agencyMembership.agency_id,
          agencyName: agencyMembership.agencies.name,
          agencySlug: agencyMembership.agencies.slug,
          role: agencyMembership.role,
        }
      : null;

  return {
    agency,
    profile,
    platformRoles,
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

export function hasAgencyRole(
  context: Pick<AppUserContext, "agency">,
  allowedRoles: AgencyRole[],
) {
  return context.agency ? allowedRoles.includes(context.agency.role) : false;
}

export async function requireAgencyUser() {
  const context = await requireAppUser();

  if (!context.agency) {
    redirect("/dashboard");
  }

  return context as AppUserContext & {
    agency: AgencyMembership;
  };
}

export async function requireAgencyRole(allowedRoles: AgencyRole[]) {
  const context = await requireAgencyUser();

  if (!hasAgencyRole(context, allowedRoles)) {
    redirect("/dashboard");
  }

  return context;
}
