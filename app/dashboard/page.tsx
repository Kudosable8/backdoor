import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  getDisplayName,
  requireAppUser,
} from "@/lib/features/auth/server";
import { DashboardView } from "@/components/features/dashboard/DashboardView";
import type {
  DashboardRecentCase,
  DashboardStats,
  DashboardTopClient,
} from "@/lib/features/dashboard/types";

function DashboardPageFallback() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    </div>
  );
}

async function DashboardPageContent() {
  const { agency, isSuperAdmin, profile, supabase, user } = await requireAppUser();
  const email = profile?.email ?? user.email;
  const fullName = getDisplayName(profile);
  let stats: DashboardStats | null = null;
  let recentCases: DashboardRecentCase[] = [];
  let topClients: DashboardTopClient[] = [];

  if (agency) {
    const [{ data: caseRows, error: caseError }, { data: importRows, error: importError }, { data: introRows, error: introError }, { data: outreachRows, error: outreachError }] =
      await Promise.all([
        supabase
          .from("cases")
          .select("id, status, current_score, score_band, assigned_to_user_id, candidate_introduction_id, last_activity_at")
          .eq("agency_id", agency.agencyId)
          .order("last_activity_at", { ascending: false }),
        supabase
          .from("imports")
          .select("id")
          .eq("agency_id", agency.agencyId),
        supabase
          .from("candidate_introductions")
          .select("id, case_id, client_company_raw, candidate_full_name")
          .eq("agency_id", agency.agencyId),
        supabase
          .from("outreach_messages")
          .select("id, status")
          .eq("agency_id", agency.agencyId),
      ]);

    if (caseError || importError || introError || outreachError) {
      throw new Error(
        caseError?.message ??
          importError?.message ??
          introError?.message ??
          outreachError?.message,
      );
    }

    const rawCases =
      (caseRows as
        | {
            assigned_to_user_id: string | null;
            candidate_introduction_id: string;
            current_score: number;
            id: string;
            score_band: DashboardRecentCase["score_band"];
            status: DashboardRecentCase["status"];
          }[]
        | null) ?? [];
    const rawIntroductions =
      (introRows as
        | {
            candidate_full_name: string;
            case_id: string | null;
            client_company_raw: string;
            id: string;
          }[]
        | null) ?? [];
    const introMap = new Map(rawIntroductions.map((row) => [row.id, row]));

    recentCases = rawCases.slice(0, 6).map((row) => {
      const intro = introMap.get(row.candidate_introduction_id);

      return {
        candidate_full_name: intro?.candidate_full_name ?? "Unknown candidate",
        client_company_raw: intro?.client_company_raw ?? "Unknown client",
        current_score: row.current_score,
        id: row.id,
        score_band: row.score_band,
        status: row.status,
      };
    });

    const clientCounts = rawIntroductions.reduce<Map<string, number>>((accumulator, row) => {
      if (!row.case_id) {
        return accumulator;
      }

      accumulator.set(
        row.client_company_raw,
        (accumulator.get(row.client_company_raw) ?? 0) + 1,
      );

      return accumulator;
    }, new Map());
    topClients = Array.from(clientCounts.entries())
      .map(([client_company_raw, case_count]) => ({ case_count, client_company_raw }))
      .sort((left, right) => right.case_count - left.case_count)
      .slice(0, 5);

    const outreachSentCount =
      (((outreachRows as { status: string }[] | null) ?? []).filter(
        (row) => row.status === "sent",
      ).length);

    stats = {
      highConfidenceCases: rawCases.filter((row) => row.score_band === "high").length,
      introductions: rawIntroductions.length,
      readyToContactCases: rawCases.filter((row) => row.status === "ready_to_contact").length,
      sentOutreach: outreachSentCount,
      totalCases: rawCases.length,
      totalImports: ((importRows as { id: string }[] | null) ?? []).length,
      userAssignedCases: rawCases.filter((row) => row.assigned_to_user_id === user.id).length,
    };
  }

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
        isSuperAdmin={isSuperAdmin}
        user={{ name: fullName, email }}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {agency ? agency.agencyName : "Workspace"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <DashboardView
            agencyName={agency?.agencyName ?? null}
            agencyRole={agency?.role ?? null}
            email={email}
            fullName={fullName}
            isSuperAdmin={isSuperAdmin}
            recentCases={recentCases}
            stats={stats}
            topClients={topClients}
            userId={user.id}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageFallback />}>
      <DashboardPageContent />
    </Suspense>
  );
}
