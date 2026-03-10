"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import type { AdminAgencyRow } from "@/lib/features/admin/types";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

type AdminAgenciesManagerProps = {
  agencies: AdminAgencyRow[];
};

export function AdminAgenciesManager({ agencies }: AdminAgenciesManagerProps) {
  const router = useRouter();
  const [isCreating, startCreateTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  const [form, setForm] = useState({
    mode: "invite_owner",
    name: "",
    ownerEmail: "",
    slug: "",
  });

  const handleCreateAgency = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startCreateTransition(async () => {
      try {
        const response = await fetch("/api/admin/agencies", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        });

        const result = (await response.json().catch(() => null)) as {
          emailSent?: boolean;
          error?: string;
          inviteUrl?: string;
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to create agency");
        }

        setForm({
          mode: "invite_owner",
          name: "",
          ownerEmail: "",
          slug: "",
        });
        toast.success("Agency created", {
          description:
            form.mode === "invite_owner"
              ? result?.emailSent
                ? "Owner invite email sent."
                : "Owner invite created."
              : "Existing user assigned as owner.",
        });
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to create agency",
        );
      }
    });
  };

  const handleResendInvite = (agencyId: string) => {
    startResendTransition(async () => {
      try {
        const response = await fetch(`/api/admin/agencies/${agencyId}/resend-owner-invite`, {
          method: "POST",
        });
        const result = (await response.json().catch(() => null)) as {
          error?: string;
          success?: boolean;
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to resend owner invite");
        }

        toast.success("Owner invite resent", {
          description: "The pending owner invite email has been sent again.",
        });
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to resend owner invite",
        );
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Create Agency</h2>
          <p className="text-sm text-muted-foreground">
            Create an agency and either assign an existing owner or generate an
            owner invite email.
          </p>
        </div>
        <form
          className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={handleCreateAgency}
        >
          <div className="grid gap-2">
            <Label htmlFor="agency-name">Agency Name</Label>
            <Input
              id="agency-name"
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agency-slug">Slug</Label>
            <Input
              id="agency-slug"
              required
              value={form.slug}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  slug: event.target.value.toLowerCase().replace(/\s+/g, "-"),
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agency-owner-email">Owner Email</Label>
            <Input
              id="agency-owner-email"
              type="email"
              required
              value={form.ownerEmail}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ownerEmail: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="agency-owner-mode">Owner Assignment</Label>
            <Select
              value={form.mode}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, mode: value }))
              }
            >
              <SelectTrigger id="agency-owner-mode" className="w-full">
                <SelectValue placeholder="Select assignment mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invite_owner">Create owner invite</SelectItem>
                <SelectItem value="existing_user">Assign existing user</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating agency..." : "Create agency"}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Agencies</h2>
          <p className="text-sm text-muted-foreground">
            Current agency workspaces and owner status.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Pending Owner Invite</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agencies.map((agency) => (
                <TableRow key={agency.id}>
                  <TableCell>{agency.name}</TableCell>
                  <TableCell>{agency.slug}</TableCell>
                  <TableCell>{agency.owner_email ?? "Not assigned"}</TableCell>
                  <TableCell>{agency.pending_owner_email ?? "None"}</TableCell>
                  <TableCell>{dateFormatter.format(new Date(agency.created_at))}</TableCell>
                  <TableCell className="text-right">
                    {agency.pending_owner_email ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isResending}
                        onClick={() => handleResendInvite(agency.id)}
                      >
                        {isResending ? "Sending..." : "Resend invite"}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">No action</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
