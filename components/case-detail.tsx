"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AgencyRole } from "@/lib/features/auth/types";
import {
  CASE_STATUSES,
  caseConfidenceLabels,
  caseStatusLabels,
  type CaseAssigneeOption,
  type CaseDetailRow,
  type CaseEvidenceRow,
  type CaseScoreEventRow,
  type CaseTimelineItem,
  type OutreachMessageRow,
} from "@/lib/features/cases/types";
import {
  CASE_EVIDENCE_STRENGTHS,
  CASE_EVIDENCE_TYPES,
  caseEvidenceStrengthLabels,
  caseEvidenceTypeLabels,
} from "@/lib/features/cases/scoring";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

type CaseDetailProps = {
  assignees: CaseAssigneeOption[];
  caseItem: CaseDetailRow;
  currentUserRole: AgencyRole;
  evidenceItems: CaseEvidenceRow[];
  outreachMessages: OutreachMessageRow[];
  scoreEvents: CaseScoreEventRow[];
  timeline: CaseTimelineItem[];
};

function getStatusVariant(status: CaseDetailRow["status"]) {
  if (status === "ready_to_contact") {
    return "default";
  }

  if (status === "dismissed") {
    return "outline";
  }

  return "secondary";
}

function getScoreVariant(scoreBand: CaseDetailRow["score_band"]) {
  if (scoreBand === "high") {
    return "default";
  }

  if (scoreBand === "medium") {
    return "secondary";
  }

  return "outline";
}

function getTimelineBadgeVariant(kind: CaseTimelineItem["kind"]) {
  if (kind === "evidence") {
    return "default";
  }

  if (kind === "score") {
    return "secondary";
  }

  return "outline";
}

export function CaseDetail({
  assignees,
  caseItem,
  currentUserRole,
  evidenceItems,
  outreachMessages,
  scoreEvents,
  timeline,
}: CaseDetailProps) {
  const router = useRouter();
  const [isSaving, startSaveTransition] = useTransition();
  const [isAddingNote, startNoteTransition] = useTransition();
  const [isAddingEvidence, startEvidenceTransition] = useTransition();
  const [isCreatingDraft, startDraftTransition] = useTransition();
  const [sendingMessageId, setSendingMessageId] = useState<string | null>(null);
  const [status, setStatus] = useState<CaseDetailRow["status"]>(caseItem.status);
  const [assignedToUserId, setAssignedToUserId] = useState(caseItem.assigned_to_user_id ?? "unassigned");
  const [noteBody, setNoteBody] = useState("");
  const [evidenceType, setEvidenceType] = useState<(typeof CASE_EVIDENCE_TYPES)[number]>("manual_note");
  const [strength, setStrength] = useState<(typeof CASE_EVIDENCE_STRENGTHS)[number]>("weak");
  const [summaryText, setSummaryText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [snippetText, setSnippetText] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [draftRecipient, setDraftRecipient] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const canEdit = currentUserRole !== "read_only";
  const canExport = currentUserRole === "owner" || currentUserRole === "manager" || currentUserRole === "finance";
  const canSend = currentUserRole === "owner" || currentUserRole === "manager" || currentUserRole === "finance";

  const handleSave = () => {
    startSaveTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseItem.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignedToUserId: assignedToUserId === "unassigned" ? null : assignedToUserId,
            status,
          }),
        });

        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to save case");
        }

        toast.success("Case updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save case");
      }
    });
  };

  const handleAddNote = () => {
    startNoteTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseItem.id}/notes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: noteBody,
          }),
        });

        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to add note");
        }

        setNoteBody("");
        toast.success("Note added");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to add note");
      }
    });
  };

  const handleAddEvidence = () => {
    startEvidenceTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("evidenceType", evidenceType);
        formData.set("strength", strength);
        formData.set("summaryText", summaryText);
        formData.set("sourceUrl", sourceUrl);
        formData.set("snippetText", snippetText);

        if (evidenceFile) {
          formData.set("file", evidenceFile);
        }

        const response = await fetch(`/api/cases/${caseItem.id}/evidence`, {
          method: "POST",
          body: formData,
        });
        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to add evidence");
        }

        setEvidenceFile(null);
        setSnippetText("");
        setSourceUrl("");
        setStrength("weak");
        setSummaryText("");
        setEvidenceType("manual_note");
        toast.success("Evidence added and case score recalculated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to add evidence");
      }
    });
  };

  const handleCreateDraft = () => {
    startDraftTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseItem.id}/outreach`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bodyMarkdown: draftBody || undefined,
            recipientEmail: draftRecipient || undefined,
            subject: draftSubject || undefined,
          }),
        });
        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to create outreach draft");
        }

        setDraftBody("");
        setDraftRecipient("");
        setDraftSubject("");
        toast.success("Outreach draft created");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to create outreach draft",
        );
      }
    });
  };

  const handleSendDraft = (messageId: string) => {
    setSendingMessageId(messageId);

    void (async () => {
      try {
        const response = await fetch(
          `/api/cases/${caseItem.id}/outreach/${messageId}/send`,
          {
            method: "POST",
          },
        );
        const result = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to send outreach draft");
        }

        toast.success("Outreach email sent");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to send outreach draft",
        );
      } finally {
        setSendingMessageId(null);
      }
    })();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{caseItem.candidate_full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {caseItem.introduced_role_raw} at {caseItem.client_company_raw}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport ? (
            <Button asChild type="button" variant="secondary">
              <a href={`/api/cases/${caseItem.id}/export`}>Export proof pack</a>
            </Button>
          ) : null}
          <Button asChild type="button" variant="outline">
            <Link href="/cases">Back to cases</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant={getStatusVariant(caseItem.status)}>
          {caseStatusLabels[caseItem.status]}
        </Badge>
        <Badge variant={getScoreVariant(caseItem.score_band)}>
          {caseItem.current_score} points / {caseConfidenceLabels[caseItem.score_band]}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Current score</CardDescription>
            <CardTitle className="text-3xl">{caseItem.current_score}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Evidence items</CardDescription>
            <CardTitle className="text-3xl">{evidenceItems.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-1">
            <CardDescription>Outreach drafts</CardDescription>
            <CardTitle className="text-3xl">{outreachMessages.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Case summary</CardTitle>
              <CardDescription>Imported introduction data driving this investigation.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 text-sm">
                <p className="font-medium">Client</p>
                <p className="text-muted-foreground">{caseItem.client_company_raw}</p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Recruiter</p>
                <p className="text-muted-foreground">{caseItem.recruiter_name ?? "Not provided"}</p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Submission date</p>
                <p className="text-muted-foreground">
                  {caseItem.submission_date
                    ? dateFormatter.format(new Date(caseItem.submission_date))
                    : "Not provided"}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Assigned investigator</p>
                <p className="text-muted-foreground">
                  {caseItem.assigned_to_user_name ?? "Unassigned"}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Candidate location</p>
                <p className="text-muted-foreground">{caseItem.candidate_location ?? "Not provided"}</p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Fee term reference</p>
                <p className="text-muted-foreground">{caseItem.fee_term_reference ?? "Not provided"}</p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Candidate LinkedIn</p>
                <p className="text-muted-foreground">
                  {caseItem.candidate_linkedin_url ? (
                    <a
                      className="underline underline-offset-4"
                      href={caseItem.candidate_linkedin_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open source link
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Client website</p>
                <p className="text-muted-foreground">
                  {caseItem.client_website ? (
                    <a
                      className="underline underline-offset-4"
                      href={caseItem.client_website}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open website
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Created</p>
                <p className="text-muted-foreground">{dateTimeFormatter.format(new Date(caseItem.created_at))}</p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">Last activity</p>
                <p className="text-muted-foreground">
                  {dateTimeFormatter.format(new Date(caseItem.last_activity_at))}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Imported notes</CardTitle>
              <CardDescription>Reference notes carried over from the source import.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {caseItem.notes?.trim() ? caseItem.notes : "No notes were included on import."}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
              <CardDescription>
                Add structured proof items. Each item recalculates the case score immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {canEdit ? (
                <div className="grid gap-4 rounded-lg border p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="evidence-type">Evidence type</Label>
                      <Select
                        value={evidenceType}
                        onValueChange={(value) => setEvidenceType(value as (typeof CASE_EVIDENCE_TYPES)[number])}
                      >
                        <SelectTrigger id="evidence-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {CASE_EVIDENCE_TYPES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {caseEvidenceTypeLabels[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="evidence-strength">Strength</Label>
                      <Select
                        value={strength}
                        onValueChange={(value) => setStrength(value as (typeof CASE_EVIDENCE_STRENGTHS)[number])}
                      >
                        <SelectTrigger id="evidence-strength">
                          <SelectValue placeholder="Select strength" />
                        </SelectTrigger>
                        <SelectContent>
                          {CASE_EVIDENCE_STRENGTHS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {caseEvidenceStrengthLabels[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="evidence-summary">Summary</Label>
                    <Textarea
                      id="evidence-summary"
                      placeholder="What does this evidence show?"
                      value={summaryText}
                      onChange={(event) => setSummaryText(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="evidence-source-url">Source URL</Label>
                      <Input
                        id="evidence-source-url"
                        placeholder="https://..."
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="evidence-file">Attachment</Label>
                      <Input
                        id="evidence-file"
                        type="file"
                        onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="evidence-snippet">Snippet or excerpt</Label>
                    <Textarea
                      id="evidence-snippet"
                      placeholder="Optional excerpt, quote, or finding details."
                      value={snippetText}
                      onChange={(event) => setSnippetText(event.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      disabled={isAddingEvidence || summaryText.trim().length === 0}
                      onClick={handleAddEvidence}
                    >
                      {isAddingEvidence ? "Adding evidence..." : "Add evidence"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3">
                {evidenceItems.length > 0 ? (
                  evidenceItems.map((item) => (
                    <div key={item.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{caseEvidenceTypeLabels[item.evidence_type]}</Badge>
                          <Badge variant="secondary">{caseEvidenceStrengthLabels[item.strength]}</Badge>
                          <Badge variant={item.score_delta >= 0 ? "default" : "outline"}>
                            {item.score_delta >= 0 ? "+" : ""}
                            {item.score_delta}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {dateTimeFormatter.format(new Date(item.created_at))}
                        </p>
                      </div>
                      <p className="mt-3 text-sm">{item.summary_text}</p>
                      <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                        <p>Added by: {item.created_by_name ?? "Unknown user"}</p>
                        <p>Source: {item.source_url ? <a className="underline underline-offset-4" href={item.source_url} rel="noreferrer" target="_blank">{item.source_url}</a> : "Not provided"}</p>
                        <p>Snippet: {item.snippet_text ?? "Not provided"}</p>
                        <p>
                          Attachment:{" "}
                          {item.attachment_signed_url && item.attachment_filename ? (
                            <a
                              className="underline underline-offset-4"
                              href={item.attachment_signed_url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {item.attachment_filename}
                            </a>
                          ) : (
                            "None"
                          )}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No evidence added yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Case activity</CardTitle>
              <CardDescription>
                Unified investigation timeline across notes, evidence, score changes, and outreach.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {canEdit ? (
                <div className="grid gap-2">
                  <Label htmlFor="case-note">Add note</Label>
                  <Textarea
                    id="case-note"
                    placeholder="Capture reviewer context, next actions, or internal commentary."
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      disabled={isAddingNote || noteBody.trim().length === 0}
                      onClick={handleAddNote}
                    >
                      {isAddingNote ? "Adding note..." : "Add note"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3">
                {timeline.length > 0 ? (
                  timeline.map((item) => (
                    <div key={item.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.title}</p>
                          <Badge variant={getTimelineBadgeVariant(item.kind)}>
                            {item.kind}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {dateTimeFormatter.format(new Date(item.created_at))}
                        </p>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                        {item.body}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Workflow controls</CardTitle>
              <CardDescription>
                Update case status and assignment. Score is derived from evidence.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="case-status-select">Status</Label>
                <Select
                  disabled={!canEdit}
                  value={status}
                  onValueChange={(value) => setStatus(value as CaseDetailRow["status"])}
                >
                  <SelectTrigger id="case-status-select">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {caseStatusLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="case-assignee-select">Assignee</Label>
                <Select
                  disabled={!canEdit}
                  value={assignedToUserId}
                  onValueChange={setAssignedToUserId}
                >
                  <SelectTrigger id="case-assignee-select">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignees.map((assignee) => (
                      <SelectItem key={assignee.user_id} value={assignee.user_id}>
                        {assignee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canEdit ? (
                <Button type="button" disabled={isSaving} onClick={handleSave}>
                  {isSaving ? "Saving..." : "Save case updates"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Read-only users can review case data but cannot update workflow fields.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Score explanation</CardTitle>
              <CardDescription>Visible rule outputs behind the current case score.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {scoreEvents.length > 0 ? (
                scoreEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {event.delta >= 0 ? "+" : ""}
                        {event.delta}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dateTimeFormatter.format(new Date(event.created_at))}
                      </span>
                    </div>
                    <p className="mt-2 text-muted-foreground">{event.explanation}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No score events yet. Add evidence to generate a transparent score trail.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outreach</CardTitle>
              <CardDescription>
                Create draft client-facing messages once the case is ready to contact.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {canEdit ? (
                <div className="grid gap-3 rounded-lg border p-4">
                  <div className="grid gap-2">
                    <Label htmlFor="draft-recipient">Recipient email</Label>
                    <Input
                      id="draft-recipient"
                      placeholder="Optional. Leave blank to generate from client website."
                      value={draftRecipient}
                      onChange={(event) => setDraftRecipient(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="draft-subject">Subject</Label>
                    <Input
                      id="draft-subject"
                      placeholder="Optional. Leave blank to use the default subject."
                      value={draftSubject}
                      onChange={(event) => setDraftSubject(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="draft-body">Body</Label>
                    <Textarea
                      id="draft-body"
                      placeholder="Optional. Leave blank to use the generated draft."
                      value={draftBody}
                      onChange={(event) => setDraftBody(event.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" disabled={isCreatingDraft} onClick={handleCreateDraft}>
                      {isCreatingDraft ? "Creating draft..." : "Create outreach draft"}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3">
                {outreachMessages.length > 0 ? (
                  outreachMessages.map((message) => (
                    <div key={message.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{message.status.toUpperCase()}</Badge>
                          {message.sent_at ? (
                            <Badge variant="secondary">
                              Sent {dateTimeFormatter.format(new Date(message.sent_at))}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            {dateTimeFormatter.format(new Date(message.created_at))}
                          </p>
                          {canSend &&
                          (message.status === "draft" || message.status === "ready" || message.status === "failed") ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSendDraft(message.id)}
                              disabled={sendingMessageId === message.id}
                            >
                              {sendingMessageId === message.id ? "Sending..." : "Send"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-3 text-sm font-medium">{message.subject}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        To: {message.recipient_email ?? "No recipient set"}
                      </p>
                      {message.resend_email_id ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Resend ID: {message.resend_email_id}
                        </p>
                      ) : null}
                      {message.error_text ? (
                        <p className="mt-1 text-sm text-destructive">
                          Send error: {message.error_text}
                        </p>
                      ) : null}
                      <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-muted-foreground">
                        {message.body_markdown}
                      </pre>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No outreach drafts created yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
