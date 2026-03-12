"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  caseCheckStatusLabels,
  caseCheckTypeLabels,
  caseResearchStatusLabels,
  MAX_RESEARCH_CHECK_ATTEMPTS,
  researchCheckOutcomeLabels,
  researchErrorLabels,
} from "@/lib/features/cases/research";
import type {
  ResearchCheckOpsRow,
  ResearchOpsSummary,
  ResearchRunRow,
} from "@/lib/features/research/types";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

type ResearchOpsViewProps = {
  failedChecks: ResearchCheckOpsRow[];
  recentRuns: ResearchRunRow[];
  summary: ResearchOpsSummary;
};

function getStatusVariant(status: ResearchCheckOpsRow["status"]) {
  if (status === "failed") {
    return "outline";
  }

  if (status === "completed") {
    return "secondary";
  }

  return "default";
}

export function ResearchOpsView({
  failedChecks,
  recentRuns,
  summary,
}: ResearchOpsViewProps) {
  const router = useRouter();
  const [isRunning, startRunTransition] = useTransition();
  const [isRetryingTransient, startRetryTransition] = useTransition();
  const [errorFilter, setErrorFilter] = useState<string>("all");
  const [retryingCheckId, setRetryingCheckId] = useState<string | null>(null);
  const errorFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          failedChecks
            .map((check) => check.error_code)
            .filter((value): value is NonNullable<typeof value> => Boolean(value)),
        ),
      ),
    [failedChecks],
  );
  const filteredFailedChecks = useMemo(
    () =>
      failedChecks.filter((check) =>
        errorFilter === "all" ? true : check.error_code === errorFilter,
      ),
    [errorFilter, failedChecks],
  );

  const handleRunAll = () => {
    startRunTransition(async () => {
      try {
        const response = await fetch("/api/cases/research/run", { method: "POST" });
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to run queued research");
        }

        toast.success("Queued research started");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to run queued research",
        );
      }
    });
  };

  const handleRetryCheck = (checkId: string) => {
    setRetryingCheckId(checkId);

    void (async () => {
      try {
        const response = await fetch(`/api/research/checks/${checkId}/retry`, {
          method: "POST",
        });
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to retry research check");
        }

        toast.success("Research check retried");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to retry research check",
        );
      } finally {
        setRetryingCheckId(null);
      }
    })();
  };

  const handleRetryTransient = () => {
    startRetryTransition(async () => {
      try {
        const response = await fetch("/api/research/checks/retry", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transientOnly: true,
          }),
        });
        const result = (await response.json().catch(() => null)) as {
          error?: string;
          retriedCheckCount?: number;
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to retry transient failures");
        }

        toast.success("Transient failures retried", {
          description: result?.retriedCheckCount
            ? `${result.retriedCheckCount} checks retried.`
            : "No transient failures were available.",
        });
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to retry transient failures",
        );
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Pending checks</CardDescription>
            <CardTitle className="text-3xl">{summary.pendingChecks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Running checks</CardDescription>
            <CardTitle className="text-3xl">{summary.runningChecks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Failed checks</CardDescription>
            <CardTitle className="text-3xl">{summary.failedChecks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Completed checks</CardDescription>
            <CardTitle className="text-3xl">{summary.completedChecks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Skipped checks</CardDescription>
            <CardTitle className="text-3xl">{summary.skippedChecks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Missing source</CardDescription>
            <CardTitle className="text-3xl">{summary.missingSourceChecks}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>No match found</CardDescription>
            <CardTitle className="text-3xl">{summary.noMatchChecks}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Research operations</CardTitle>
            <CardDescription>
              Monitor queue health, failed checks, and recent automated runs.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isRetryingTransient}
              onClick={handleRetryTransient}
            >
              {isRetryingTransient ? "Retrying..." : "Retry transient failures"}
            </Button>
            <Button type="button" variant="secondary" disabled={isRunning} onClick={handleRunAll}>
              {isRunning ? "Running..." : "Run queued research"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <CardTitle>Failed checks</CardTitle>
                <CardDescription>
                  Checks that need review or retry.
                </CardDescription>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="research-error-filter">Filter by error</Label>
                <Select value={errorFilter} onValueChange={setErrorFilter}>
                  <SelectTrigger id="research-error-filter" className="w-[240px]">
                    <SelectValue placeholder="All failure categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All failure categories</SelectItem>
                    {errorFilterOptions.map((value) => (
                      <SelectItem key={value} value={value}>
                        {researchErrorLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {filteredFailedChecks.length > 0 ? (
              filteredFailedChecks.map((check) => (
                <div key={check.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{check.candidate_full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {caseCheckTypeLabels[check.check_type]}
                      </p>
                    </div>
                    <Badge variant={getStatusVariant(check.status)}>
                      {caseCheckStatusLabels[check.status]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {check.error_text ?? "No error message recorded."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    {check.outcome ? (
                      <Badge variant="secondary">{researchCheckOutcomeLabels[check.outcome]}</Badge>
                    ) : null}
                    {check.error_code ? (
                      <Badge variant="outline">{researchErrorLabels[check.error_code]}</Badge>
                    ) : null}
                    <span className="text-muted-foreground">
                      Case status: {caseResearchStatusLabels[check.research_status]}
                    </span>
                    <span className="text-muted-foreground">
                      Attempts: {check.attempt_count}/{MAX_RESEARCH_CHECK_ATTEMPTS}
                    </span>
                    {check.source_url ? (
                      <a
                        className="underline underline-offset-4"
                        href={check.source_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open source
                      </a>
                    ) : null}
                    <Link className="underline underline-offset-4" href={`/cases/${check.case_id}`}>
                      Open case
                    </Link>
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        retryingCheckId === check.id ||
                        check.attempt_count >= MAX_RESEARCH_CHECK_ATTEMPTS
                      }
                      onClick={() => handleRetryCheck(check.id)}
                    >
                      {check.attempt_count >= MAX_RESEARCH_CHECK_ATTEMPTS
                        ? "Retry limit reached"
                        : retryingCheckId === check.id
                          ? "Retrying..."
                          : "Retry check"}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {failedChecks.length > 0
                  ? "No failed checks match this filter."
                  : "No failed checks."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>
              Manual and cron executions for this agency.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {recentRuns.length > 0 ? (
              recentRuns.map((run) => (
                <div key={run.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">
                      {run.trigger_source.replaceAll("_", " ")}
                    </span>
                    <Badge variant={run.status === "failed" ? "outline" : "secondary"}>
                      {run.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    Started {dateTimeFormatter.format(new Date(run.started_at))}
                  </p>
                  <p className="text-muted-foreground">
                    {run.processed_checks_count} processed • {run.evidence_created_count} evidence
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No run history yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
