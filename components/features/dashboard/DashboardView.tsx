import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { agencyRoleLabels } from "@/lib/features/auth/types";
import { caseConfidenceLabels, caseStatusLabels } from "@/lib/features/cases/types";
import type { DashboardViewModel } from "@/lib/features/dashboard/types";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getEmailLookupBadge(status: DashboardViewModel["recentCases"][number]["email_lookup_status"]) {
  if (status === "deliverable_found") {
    return { label: "Deliverable email", variant: "default" as const };
  }

  if (status === "no_match") {
    return { label: "No email", variant: "secondary" as const };
  }

  if (status === "queued") {
    return { label: "Email queued", variant: "secondary" as const };
  }

  if (status === "running") {
    return { label: "Email running", variant: "secondary" as const };
  }

  if (status === "needs_review") {
    return { label: "Email review", variant: "outline" as const };
  }

  if (status === "missing_source") {
    return { label: "Email missing source", variant: "outline" as const };
  }

  return { label: "Email not started", variant: "outline" as const };
}

export function DashboardView({
  agencyName,
  email,
  fullName,
  isSuperAdmin,
  agencyRole,
  recentCases,
  stats,
  topClients,
  userId,
}: DashboardViewModel) {
  if (!agencyName || !agencyRole || !stats) {
    return (
      <section className="flex flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your account is active, but you do not have an agency workspace yet.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Profile summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Full name:</span> {fullName}
            </p>
            <p>
              <span className="font-medium">Email:</span> {email}
            </p>
            <p>
              <span className="font-medium">User ID:</span> {userId}
            </p>
            <p>
              <span className="font-medium">Platform role:</span>{" "}
              {isSuperAdmin ? "Super Admin" : "Standard User"}
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Operational view for {agencyName}. Track imports, live case volume, outreach readiness, and immediate next actions.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Total imports</CardDescription>
            <CardTitle className="text-3xl">{stats.totalImports}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Total cases</CardDescription>
            <CardTitle className="text-3xl">{stats.totalCases}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Ready to contact</CardDescription>
            <CardTitle className="text-3xl">{stats.readyToContactCases}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Outreach sent</CardDescription>
            <CardTitle className="text-3xl">{stats.sentOutreach}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Introductions loaded</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {stats.introductions}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>High confidence</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {stats.highConfidenceCases}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deliverable email</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {stats.deliverableEmailCases}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assigned to you</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {stats.userAssignedCases}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace role</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{agencyRoleLabels[agencyRole]}</p>
            <p className="text-muted-foreground">{email}</p>
            <p className="text-muted-foreground">
              {isSuperAdmin ? "Platform admin access enabled" : "Agency-scoped access"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Research queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{stats.pendingResearchChecks} pending</p>
            <p>{stats.failedResearchChecks} failed</p>
            <p>{stats.completedResearchChecks} completed</p>
            <p>{stats.matchedResearchChecksLast7Days} matched in last 7 days</p>
            <p>{stats.noMatchResearchChecksLast7Days} no-match in last 7 days</p>
            <p className="text-muted-foreground">
              {stats.recentResearchRunAt
                ? `Last run ${dateTimeFormatter.format(new Date(stats.recentResearchRunAt))} • ${stats.recentResearchRunsCount} recent runs`
                : "No research runs yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Recent cases</CardTitle>
              <CardDescription>Latest work entering the reviewer workflow.</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/cases">Open queue</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {recentCases.length > 0 ? (
              recentCases.map((caseRow) => (
                <Link
                  key={caseRow.id}
                  href={`/cases/${caseRow.id}`}
                  className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{caseRow.candidate_full_name}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{caseStatusLabels[caseRow.status]}</Badge>
                      <Badge variant="secondary">
                        {caseRow.current_score} / {caseConfidenceLabels[caseRow.score_band]}
                      </Badge>
                      <Badge variant={getEmailLookupBadge(caseRow.email_lookup_status).variant}>
                        {getEmailLookupBadge(caseRow.email_lookup_status).label}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {caseRow.client_company_raw}
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No cases yet. Start with a CSV import to create the first review queue.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Top risk clients</CardTitle>
              <CardDescription>Clients generating the most case volume right now.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {topClients.length > 0 ? (
                topClients.map((client) => (
                  <div key={client.client_company_raw} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{client.client_company_raw}</span>
                    <Badge variant="outline">{client.case_count} cases</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No client risk data yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Primary flows for the current MVP.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {(agencyRole === "owner" || agencyRole === "manager" || agencyRole === "recruiter") ? (
                <Button asChild className="justify-start" variant="outline">
                  <Link href="/imports">Import candidate introductions</Link>
                </Button>
              ) : null}
              <Button asChild className="justify-start" variant="outline">
                <Link href="/cases">Review active cases</Link>
              </Button>
              {(agencyRole === "owner" || agencyRole === "manager" || agencyRole === "finance") ? (
                <Button asChild className="justify-start" variant="outline">
                  <Link href="/research">Research operations</Link>
                </Button>
              ) : null}
              {(agencyRole === "owner" || agencyRole === "manager") ? (
                <Button asChild className="justify-start" variant="outline">
                  <Link href="/team">Manage agency team</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
