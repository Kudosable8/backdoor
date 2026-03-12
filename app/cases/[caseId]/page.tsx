import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { CaseDetail } from "@/components/case-detail";
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
import { getCaseDetailData } from "@/lib/features/cases/server";

type CasePageProps = {
  params: Promise<{
    caseId: string;
  }>;
};

function CaseDetailFallback() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading case…</p>
      </div>
    </div>
  );
}

async function CaseDetailPageContent({ params }: CasePageProps) {
  const { caseId } = await params;
  const appUser = await requireAgencyUser();
  const caseData = await getCaseDetailData({ appUser, caseId });
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
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/cases">Cases</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{caseData.caseItem.candidate_full_name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
          <CaseDetail
            assignees={caseData.assignees}
            caseItem={caseData.caseItem}
            checks={caseData.checks}
            currentUserRole={appUser.agency.role}
            evidenceItems={caseData.evidenceItems}
            outreachMessages={caseData.outreachMessages}
            scoreEvents={caseData.scoreEvents}
            timeline={caseData.timeline}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function CaseDetailPage(props: CasePageProps) {
  return (
    <Suspense fallback={<CaseDetailFallback />}>
      <CaseDetailPageContent {...props} />
    </Suspense>
  );
}
