import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { ImportsManager } from "@/components/imports-manager";
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
  ImportHistoryRow,
  SavedImportMapping,
} from "@/lib/features/imports/types";

function ImportsPageFallback() {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading imports…</p>
      </div>
    </div>
  );
}

async function ImportsPageContent() {
  const { agency, profile, supabase, user } = await requireAgencyRole([
    "owner",
    "manager",
    "recruiter",
  ]);
  const [{ data: mappingsRows, error: mappingsError }, { data: importRows, error: importsError }] =
    await Promise.all([
      supabase
        .from("import_mappings")
        .select("id, name, field_mapping_json, created_at")
        .eq("agency_id", agency.agencyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("imports")
        .select(
          "id, original_filename, status, row_count, valid_row_count, invalid_row_count, duplicate_row_count, created_at",
        )
        .eq("agency_id", agency.agencyId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  if (mappingsError || importsError) {
    throw new Error(mappingsError?.message ?? importsError?.message);
  }

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
                  <BreadcrumbPage>Imports</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 pt-0">
          <ImportsManager
            history={(importRows as ImportHistoryRow[] | null) ?? []}
            savedMappings={(mappingsRows as SavedImportMapping[] | null) ?? []}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function ImportsPage() {
  return (
    <Suspense fallback={<ImportsPageFallback />}>
      <ImportsPageContent />
    </Suspense>
  );
}
