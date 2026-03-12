"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilterX, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CASE_CONFIDENCE_LEVELS,
  CASE_STATUSES,
  caseConfidenceLabels,
  caseStatusLabels,
  type CaseQueueRow,
} from "@/lib/features/cases/types";
import { caseResearchStatusLabels } from "@/lib/features/cases/research";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

type CasesQueueProps = {
  rows: CaseQueueRow[];
};

function getStatusVariant(status: CaseQueueRow["status"]) {
  if (status === "ready_to_contact") {
    return "default";
  }

  if (status === "dismissed") {
    return "outline";
  }

  return "secondary";
}

function getConfidenceVariant(confidence: CaseQueueRow["confidence"]) {
  if (confidence === "high") {
    return "default";
  }

  if (confidence === "medium") {
    return "secondary";
  }

  return "outline";
}

export function CasesQueue({ rows }: CasesQueueProps) {
  const router = useRouter();
  const [isRunningResearch, startResearchTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [confidence, setConfidence] = useState<string>("all");
  const [recruiter, setRecruiter] = useState<string>("all");
  const [client, setClient] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const recruiterOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => row.recruiter_name).filter((value): value is string => Boolean(value))),
      ).sort((left, right) => left.localeCompare(right)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedClient = client.trim().toLowerCase();

    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) {
        return false;
      }

      if (confidence !== "all" && row.confidence !== confidence) {
        return false;
      }

      if (recruiter !== "all" && row.recruiter_name !== recruiter) {
        return false;
      }

      if (normalizedClient && !row.client_company_raw.toLowerCase().includes(normalizedClient)) {
        return false;
      }

      if (dateFrom && (!row.submission_date || row.submission_date < dateFrom)) {
        return false;
      }

      if (dateTo && (!row.submission_date || row.submission_date > dateTo)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        row.candidate_full_name,
        row.client_company_raw,
        row.introduced_role_raw,
        row.assigned_to_user_name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [client, confidence, dateFrom, dateTo, query, recruiter, rows, status]);

  const summary = useMemo(() => {
    return {
      highConfidence: rows.filter((row) => row.confidence === "high").length,
      pendingResearch: rows.filter((row) => row.pending_check_count > 0).length,
      readyToContact: rows.filter((row) => row.status === "ready_to_contact").length,
      total: rows.length,
      unassigned: rows.filter((row) => !row.assigned_to_user_id).length,
    };
  }, [rows]);

  const handleRunResearch = () => {
    startResearchTransition(async () => {
      try {
        const response = await fetch("/api/cases/research/run", {
          method: "POST",
        });
        const result = (await response.json().catch(() => null)) as {
          error?: string;
          summary?: {
            evidenceCreated: number;
            processed: number;
          };
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to run queued research");
        }

        toast.success("Research run finished", {
          description:
            result?.summary?.processed
              ? `${result.summary.processed} checks processed, ${result.summary.evidenceCreated} evidence items created.`
              : "No queued checks were available.",
        });
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to run queued research",
        );
      }
    });
  };

  const resetFilters = () => {
    setClient("");
    setConfidence("all");
    setDateFrom("");
    setDateTo("");
    setQuery("");
    setRecruiter("all");
    setStatus("all");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Total cases</CardDescription>
            <CardTitle className="text-3xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Ready to contact</CardDescription>
            <CardTitle className="text-3xl">{summary.readyToContact}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>High confidence</CardDescription>
            <CardTitle className="text-3xl">{summary.highConfidence}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Unassigned</CardDescription>
            <CardTitle className="text-3xl">{summary.unassigned}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Research queued</CardDescription>
            <CardTitle className="text-3xl">{summary.pendingResearch}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Review queue</CardTitle>
              <CardDescription>
                Filter active backdoor-hire investigations by status, recruiter, client, and submission date.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={isRunningResearch}
              onClick={handleRunResearch}
            >
              {isRunningResearch ? "Running research..." : "Run queued research"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="case-query">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="case-query"
                  className="pl-9"
                  placeholder="Candidate, client, role, assignee"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="case-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {CASE_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {caseStatusLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-confidence">Confidence</Label>
              <Select value={confidence} onValueChange={setConfidence}>
                <SelectTrigger id="case-confidence">
                  <SelectValue placeholder="All confidence levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All confidence levels</SelectItem>
                  {CASE_CONFIDENCE_LEVELS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {caseConfidenceLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-recruiter">Recruiter</Label>
              <Select value={recruiter} onValueChange={setRecruiter}>
                <SelectTrigger id="case-recruiter">
                  <SelectValue placeholder="All recruiters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All recruiters</SelectItem>
                  {recruiterOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-client">Client</Label>
              <Input
                id="case-client"
                placeholder="Filter by client company"
                value={client}
                onChange={(event) => setClient(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-date-from">Submission date from</Label>
              <Input
                id="case-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-date-to">Submission date to</Label>
              <Input
                id="case-date-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={resetFilters}>
                <FilterX className="size-4" />
                Reset filters
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredRows.length > 0 ? (
              <Table className="min-w-[960px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Research</TableHead>
                    <TableHead>Recruiter</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Submission</TableHead>
                    <TableHead>Last activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <Link className="hover:underline" href={`/cases/${row.id}`}>
                          {row.candidate_full_name}
                        </Link>
                      </TableCell>
                      <TableCell>{row.client_company_raw}</TableCell>
                      <TableCell>{row.introduced_role_raw}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(row.status)}>
                          {caseStatusLabels[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getConfidenceVariant(row.confidence)}>
                          {caseConfidenceLabels[row.confidence]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium">
                            {caseResearchStatusLabels[row.research_status]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {row.pending_check_count > 0
                              ? `${row.pending_check_count} queued`
                              : "No queued checks"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{row.recruiter_name ?? "Unassigned"}</TableCell>
                      <TableCell>{row.assigned_to_user_name ?? "Unassigned"}</TableCell>
                      <TableCell>
                        {row.submission_date
                          ? dateFormatter.format(new Date(row.submission_date))
                          : "Unknown"}
                      </TableCell>
                      <TableCell>{dateTimeFormatter.format(new Date(row.last_activity_at))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty className="min-h-[280px] rounded-xl border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>No cases match these filters</EmptyTitle>
                  <EmptyDescription>
                    Reset the queue filters or import more introductions to generate cases.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
