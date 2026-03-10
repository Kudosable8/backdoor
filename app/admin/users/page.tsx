import { Suspense } from "react";

import { AdminAgenciesManager } from "@/components/admin-agencies-manager";
import { AdminUsersManager } from "@/components/admin-users-manager";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type {
  AdminAgencyOption,
  AdminAgencyRow,
  AdminUserRow,
} from "@/lib/features/admin/types";
import {
  getDisplayName,
  requireSuperAdminUser,
} from "@/lib/features/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

function AdminUsersFallback() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading users…</p>
      </div>
    </div>
  );
}

async function AdminUsersContent() {
  const { agency, profile, supabase, user } = await requireSuperAdminUser();
  const { data, error } = await supabase.rpc("admin_list_users");
  const adminClient = createAdminClient();
  const { data: agencyRows, error: agenciesError } = await supabase
    .from("agencies")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  if (agenciesError) {
    throw new Error(agenciesError.message);
  }

  const agencies = (agencyRows ??
    []) as {
    created_at: string;
    id: string;
    name: string;
    slug: string;
  }[];
  const agencyIds = agencies.map((agencyRow) => agencyRow.id);
  const { data: ownerMemberships, error: ownerMembershipsError } = agencyIds.length
    ? await supabase
        .from("agency_memberships")
        .select("agency_id, user_id")
        .eq("role", "owner")
        .in("agency_id", agencyIds)
    : { data: [], error: null };
  const ownerUserIds = ((ownerMemberships ??
    []) as { agency_id: string; user_id: string }[]).map(
    (membership) => membership.user_id,
  );
  const { data: ownerProfiles, error: ownerProfilesError } = ownerUserIds.length
    ? await adminClient
        .from("profiles")
        .select("id, email")
        .in("id", ownerUserIds)
    : { data: [], error: null };
  const { data: pendingOwnerInvites, error: pendingOwnerInvitesError } = agencyIds.length
    ? await adminClient
        .from("agency_invites")
        .select("agency_id, email")
        .eq("role", "owner")
        .is("accepted_at", null)
        .in("agency_id", agencyIds)
    : { data: [], error: null };

  if (ownerMembershipsError || ownerProfilesError || pendingOwnerInvitesError) {
    throw new Error(
      ownerMembershipsError?.message ??
        ownerProfilesError?.message ??
        pendingOwnerInvitesError?.message,
    );
  }

  const users = (data as AdminUserRow[] | null) ?? [];
  const userIds = users.map((listedUser) => listedUser.id);
  const { data: membershipRows, error: membershipsError } = userIds.length
    ? await supabase
        .from("agency_memberships")
        .select("agency_id, role, user_id")
        .in("user_id", userIds)
    : { data: [], error: null };

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const ownerEmailByUserId = new Map(
    (((ownerProfiles as { email: string | null; id: string }[] | null) ?? [])).map(
      (ownerProfile) => [ownerProfile.id, ownerProfile.email],
    ),
  );
  const ownerMembershipByAgencyId = new Map(
    (((ownerMemberships as
      | { agency_id: string; user_id: string }[]
      | null) ?? [])).map((membership) => [membership.agency_id, membership]),
  );
  const pendingOwnerInviteByAgencyId = new Map(
    (((pendingOwnerInvites as
      | { agency_id: string; email: string }[]
      | null) ?? [])).map((inviteRow) => [inviteRow.agency_id, inviteRow.email]),
  );
  const agenciesForAdmin: AdminAgencyRow[] = agencies.map((agencyRow) => {
    const ownerMembership = ownerMembershipByAgencyId.get(agencyRow.id);

    return {
      created_at: agencyRow.created_at,
      id: agencyRow.id,
      name: agencyRow.name,
      owner_email: ownerMembership
        ? ownerEmailByUserId.get(ownerMembership.user_id) ?? null
        : null,
      owner_user_id: ownerMembership?.user_id ?? null,
      pending_owner_email: pendingOwnerInviteByAgencyId.get(agencyRow.id) ?? null,
      slug: agencyRow.slug,
    };
  });
  const agencyById = new Map(
    agencies.map((agencyRow) => [
      agencyRow.id,
      {
        id: agencyRow.id,
        name: agencyRow.name,
        slug: agencyRow.slug,
      },
    ]),
  );
  const membershipByUserId = new Map(
    (((membershipRows as
      | {
          agency_id: string;
          role: AdminUserRow["agency_role"];
          user_id: string;
        }[]
      | null) ?? [])).map((membership) => [membership.user_id, membership]),
  );
  const usersForAdmin: AdminUserRow[] = users.map((listedUser) => {
    const membership = membershipByUserId.get(listedUser.id);
    const agencyOption = membership ? agencyById.get(membership.agency_id) : null;

    return {
      ...listedUser,
      agency_id: membership?.agency_id ?? null,
      agency_name: agencyOption?.name ?? null,
      agency_role: membership?.role ?? null,
    };
  });
  const agencyOptions: AdminAgencyOption[] = agencies.map((agencyRow) => ({
    id: agencyRow.id,
    name: agencyRow.name,
    slug: agencyRow.slug,
  }));
  const email = profile?.email ?? user.email;
  const fullName = getDisplayName(profile);

  return (
    <SidebarProvider>
      <AppSidebar
        agency={
          agency
            ? {
                name: agency.agencyName,
                role: agency.role,
                slug: agency.agencySlug,
              }
            : null
        }
        isSuperAdmin
        user={{ name: fullName, email }}
      />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/admin/users">Admin</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Users</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
          <AdminAgenciesManager agencies={agenciesForAdmin} />
          <AdminUsersManager agencies={agencyOptions} users={usersForAdmin} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<AdminUsersFallback />}>
      <AdminUsersContent />
    </Suspense>
  );
}
