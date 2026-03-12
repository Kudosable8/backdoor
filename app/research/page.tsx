import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { ResearchOpsView } from "@/components/research-ops-view";
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
import type {
  ResearchCheckOpsRow,
  ResearchOpsSummary,
  ResearchRunRow,
} from "@/lib/features/research/types";

function ResearchPageFallback() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading research ops…</p>
      </div>
    </div>
  );
}

async function ResearchPageContent() {
  const appUser = await requireAgencyRole(["owner", "manager", "finance"]);
  const [checkRowsResult, runRowsResult] = await Promise.all([
    appUser.supabase
      .from("case_checks")
      .select(
        "id, case_id, check_type, status, attempt_count, completed_at, error_text, source_url, result_json, cases(research_status, candidate_introductions!cases_candidate_introduction_id_fkey(candidate_full_name))",
      )
      .eq("agency_id", appUser.agency.agencyId)
      .order("created_at", { ascending: false })
      .limit(100),
    appUser.supabase
      .from("research_runs")
      .select(
        "id, trigger_source, status, processed_checks_count, completed_checks_count, failed_checks_count, evidence_created_count, started_at, completed_at",
      )
      .eq("agency_id", appUser.agency.agencyId)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  if (checkRowsResult.error || runRowsResult.error) {
    throw new Error(checkRowsResult.error?.message ?? runRowsResult.error?.message);
  }

  const allChecks = ((checkRowsResult.data as
    | {
        case_id: string;
        cases:
          | {
              candidate_introductions:
                | {
                    candidate_full_name: string;
                  }
                | {
                    candidate_full_name: string;
                  }[]
                | null;
              research_status: ResearchCheckOpsRow["research_status"];
            }
          | {
              candidate_introductions:
                | {
                    candidate_full_name: string;
                  }
                | {
                    candidate_full_name: string;
                  }[]
                | null;
              research_status: ResearchCheckOpsRow["research_status"];
            }[]
          | null;
        check_type: ResearchCheckOpsRow["check_type"];
        attempt_count: number;
        completed_at: string | null;
        error_code: ResearchCheckOpsRow["error_code"];
        error_text: string | null;
        id: string;
        result_json: {
          email?: string;
          errorCode?: ResearchCheckOpsRow["error_code"];
          outcome?: ResearchCheckOpsRow["outcome"];
          snippet?: string;
        } | null;
        source_url: string | null;
        status: ResearchCheckOpsRow["status"];
      }[]
    | null) ?? []).map((row) => {
    const caseJoin = Array.isArray(row.cases) ? row.cases[0] ?? null : row.cases;
    const introJoin = Array.isArray(caseJoin?.candidate_introductions)
      ? caseJoin?.candidate_introductions[0] ?? null
      : caseJoin?.candidate_introductions ?? null;

    return {
      candidate_full_name: introJoin?.candidate_full_name ?? "Unknown candidate",
      case_id: row.case_id,
      check_type: row.check_type,
      attempt_count: row.attempt_count,
      completed_at: row.completed_at,
      error_code: row.result_json?.errorCode ?? null,
      error_text: row.error_text,
      id: row.id,
      outcome: row.result_json?.outcome ?? null,
      research_status: caseJoin?.research_status ?? "not_started",
      result_summary:
        typeof row.result_json?.snippet === "string"
          ? row.result_json.snippet
          : typeof row.result_json?.email === "string"
            ? row.result_json.email
            : null,
      source_url: row.source_url,
      status: row.status,
    } satisfies ResearchCheckOpsRow;
  });

  const failedChecks = allChecks.filter((row) => row.status === "failed");
  const summary: ResearchOpsSummary = {
    completedChecks: allChecks.filter((row) => row.status === "completed").length,
    failedChecks: failedChecks.length,
    missingSourceChecks: allChecks.filter(
      (row) => row.status === "skipped" && row.error_code === "missing_client_website",
    ).length,
    noMatchChecks: allChecks.filter((row) => row.outcome === "no_match_found").length,
    pendingChecks: allChecks.filter((row) => row.status === "pending").length,
    runningChecks: allChecks.filter((row) => row.status === "processing").length,
    skippedChecks: allChecks.filter((row) => row.status === "skipped").length,
  };
  const recentRuns = ((runRowsResult.data as ResearchRunRow[] | null) ?? []);
  const email = appUser.profile?.email ?? appUser.user.email;
  const fullName = getDisplayName(appUser.profile);

  return (
    <SidebarProvider>
      <AppSidebar
        agency={{
          name: appUser.agency.agencyName,
          role: appUser.agency.role,
          slug: appUser.agency.agencySlug,
        }}
        isSuperAdmin={appUser.isSuperAdmin}
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
                  <BreadcrumbPage>Research Ops</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
          <ResearchOpsView
            failedChecks={failedChecks}
            recentRuns={recentRuns}
            summary={summary}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function ResearchPage() {
  return (
    <Suspense fallback={<ResearchPageFallback />}>
      <ResearchPageContent />
    </Suspense>
  );
}
