import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { TeamManagement } from "@/components/team-management";
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
import { getDisplayName, requireAgencyRole } from "@/lib/features/auth/server";
import type { PendingInviteRow, TeamMemberRow } from "@/lib/features/team/types";
import { createAdminClient } from "@/lib/supabase/admin";

function TeamPageFallback() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading team…</p>
      </div>
    </div>
  );
}

async function TeamPageContent() {
  const { agency, profile, supabase, user } = await requireAgencyRole([
    "owner",
    "manager",
  ]);

  const [{ data: membershipRows, error: membershipError }, { data: inviteRows, error: inviteError }] =
    await Promise.all([
      supabase
        .from("agency_memberships")
        .select("user_id, role, created_at")
        .eq("agency_id", agency.agencyId)
        .order("created_at", { ascending: true }),
      supabase
        .from("agency_invites")
        .select("id, email, role, created_at, expires_at")
        .eq("agency_id", agency.agencyId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
    ]);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (inviteError) {
    throw new Error(inviteError.message);
  }

  const rawMembers =
    (membershipRows as
      | {
          created_at: string;
          role: TeamMemberRow["role"];
          user_id: string;
        }[]
      | null) ?? [];
  const profileIds = rawMembers.map((member) => member.user_id);
  const adminClient = createAdminClient();
  const { data: adminProfileRows, error: adminProfilesError } = profileIds.length
    ? await adminClient
        .from("profiles")
        .select("id, email, full_name, first_name, last_name")
        .in("id", profileIds)
    : { data: [], error: null };

  if (adminProfilesError) {
    throw new Error(adminProfilesError.message);
  }

  const profileMap = new Map(
    ((adminProfileRows as
      | {
          email: string | null;
          first_name: string | null;
          full_name: string | null;
          id: string;
          last_name: string | null;
        }[]
      | null) ?? []
    ).map((profileRow) => [profileRow.id, profileRow]),
  );
  const members: TeamMemberRow[] = rawMembers.map((member) => {
    const memberProfile = profileMap.get(member.user_id);

    return {
      created_at: member.created_at,
      email: memberProfile?.email ?? null,
      first_name: memberProfile?.first_name ?? null,
      full_name: memberProfile?.full_name ?? null,
      last_name: memberProfile?.last_name ?? null,
      role: member.role,
      user_id: member.user_id,
    };
  });
  const pendingInvites = (inviteRows as PendingInviteRow[] | null) ?? [];
  const email = profile?.email ?? user.email;
  const fullName = getDisplayName(profile);

  return (
    <SidebarProvider>
      <AppSidebar
        agency={{
          name: agency.agencyName,
          role: agency.role,
          slug: agency.agencySlug,
        }}
        isSuperAdmin={false}
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
                <BreadcrumbItem>
                  <BreadcrumbPage>Team</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
          <TeamManagement
            currentUserRole={agency.role}
            members={members}
            pendingInvites={pendingInvites}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<TeamPageFallback />}>
      <TeamPageContent />
    </Suspense>
  );
}
