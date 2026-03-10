import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { CasesQueue } from "@/components/cases-queue";
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
import { getDisplayName, requireAgencyUser } from "@/lib/features/auth/server";
import type { CaseQueueRow } from "@/lib/features/cases/types";
import { createAdminClient } from "@/lib/supabase/admin";

function CasesPageFallback() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading cases…</p>
      </div>
    </div>
  );
}

async function CasesPageContent() {
  const { agency, profile, supabase, user } = await requireAgencyUser();
  const { data: caseRows, error: casesError } = await supabase
    .from("cases")
    .select(
      "id, candidate_introduction_id, status, confidence, assigned_to_user_id, created_at, last_activity_at, candidate_introductions!cases_candidate_introduction_id_fkey(id, candidate_full_name, client_company_raw, introduced_role_raw, recruiter_name, submission_date)",
    )
    .eq("agency_id", agency.agencyId)
    .order("last_activity_at", { ascending: false });

  if (casesError) {
    throw new Error(casesError.message);
  }

  const rawCases =
    (caseRows as
      | {
          assigned_to_user_id: string | null;
          candidate_introduction_id: string;
          candidate_introductions:
            | {
                candidate_full_name: string;
                client_company_raw: string;
                id: string;
                introduced_role_raw: string;
                recruiter_name: string | null;
                submission_date: string | null;
              }
            | {
                candidate_full_name: string;
                client_company_raw: string;
                id: string;
                introduced_role_raw: string;
                recruiter_name: string | null;
                submission_date: string | null;
              }[]
            | null;
          confidence: CaseQueueRow["confidence"];
          created_at: string;
          id: string;
          last_activity_at: string;
          status: CaseQueueRow["status"];
        }[]
      | null) ?? [];
  const assigneeIds = Array.from(
    new Set(rawCases.map((row) => row.assigned_to_user_id).filter((value): value is string => Boolean(value))),
  );
  const adminClient = createAdminClient();
  const { data: profileRows, error: profilesError } = assigneeIds.length
    ? await adminClient
        .from("profiles")
        .select("id, full_name, first_name, last_name")
        .in("id", assigneeIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }
  const profileMap = new Map(
    (((profileRows as
      | {
          first_name: string | null;
          full_name: string | null;
          id: string;
          last_name: string | null;
        }[]
      | null) ?? [])).map((row) => {
      const derivedName =
        row.full_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Unknown user";

      return [row.id, derivedName];
    }),
  );
  const rows: CaseQueueRow[] = rawCases
    .map((row) => {
      const introduction = Array.isArray(row.candidate_introductions)
        ? row.candidate_introductions[0] ?? null
        : row.candidate_introductions;

      if (!introduction) {
        return null;
      }

      return {
        assigned_to_user_id: row.assigned_to_user_id,
        assigned_to_user_name: row.assigned_to_user_id
          ? (profileMap.get(row.assigned_to_user_id) ?? "Unknown user")
          : null,
        candidate_full_name: introduction.candidate_full_name,
        client_company_raw: introduction.client_company_raw,
        confidence: row.confidence,
        created_at: row.created_at,
        id: row.id,
        introduced_role_raw: introduction.introduced_role_raw,
        last_activity_at: row.last_activity_at,
        recruiter_name: introduction.recruiter_name,
        status: row.status,
        submission_date: introduction.submission_date,
      };
    })
    .filter((row): row is CaseQueueRow => Boolean(row));

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
                  <BreadcrumbPage>Cases</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
          <CasesQueue rows={rows} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function CasesPage() {
  return (
    <Suspense fallback={<CasesPageFallback />}>
      <CasesPageContent />
    </Suspense>
  );
}
