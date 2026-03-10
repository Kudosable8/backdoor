import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { AuditLogView } from "@/components/audit-log-view";
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
import type { AuditEventRow } from "@/lib/features/audit/types";
import { createAdminClient } from "@/lib/supabase/admin";

function AuditPageFallback() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading audit trail…</p>
      </div>
    </div>
  );
}

async function AuditPageContent() {
  const { agency, profile, supabase, user } = await requireAgencyRole([
    "owner",
    "manager",
    "finance",
  ]);
  const { data: auditRows, error } = await supabase
    .from("audit_events")
    .select("id, entity_type, entity_id, action, metadata_json, created_at, actor_user_id")
    .eq("agency_id", agency.agencyId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const actorIds = Array.from(
    new Set(
      (((auditRows as { actor_user_id: string | null }[] | null) ?? [])
        .map((row) => row.actor_user_id)
        .filter((value): value is string => Boolean(value))),
    ),
  );
  const adminClient = createAdminClient();
  const { data: profileRows, error: profileError } = actorIds.length
    ? await adminClient
        .from("profiles")
        .select("id, full_name, first_name, last_name")
        .in("id", actorIds)
    : { data: [], error: null };

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileMap = new Map(
    (((profileRows as
      | {
          first_name: string | null;
          full_name: string | null;
          id: string;
          last_name: string | null;
        }[]
      | null) ?? [])).map((row) => [
      row.id,
      row.full_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Unknown user",
    ]),
  );
  const events: AuditEventRow[] =
    (((auditRows as
      | {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata_json: Record<string, unknown> | null;
        }[]
      | null) ?? [])).map((row) => ({
      action: row.action,
      actor_name: row.actor_user_id ? (profileMap.get(row.actor_user_id) ?? "Unknown user") : null,
      created_at: row.created_at,
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      id: row.id,
      metadata_json: row.metadata_json ?? {},
    }));

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
                  <BreadcrumbPage>Audit</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
          <AuditLogView events={events} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<AuditPageFallback />}>
      <AuditPageContent />
    </Suspense>
  );
}
