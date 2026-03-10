"use client";

import { useMemo, useState, useTransition } from "react";
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
import { agencyRoleLabels, type AgencyRole } from "@/lib/features/auth/types";
import type {
  PendingInviteRow,
  TeamMemberRow,
} from "@/lib/features/team/types";
import { useRouter } from "next/navigation";

type TeamManagementProps = {
  currentUserRole: AgencyRole;
  members: TeamMemberRow[];
  pendingInvites: PendingInviteRow[];
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function TeamManagement({
  currentUserRole,
  members,
  pendingInvites,
}: TeamManagementProps) {
  const router = useRouter();
  const [isInviting, startInviteTransition] = useTransition();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AgencyRole>(
    currentUserRole === "owner" ? "manager" : "recruiter",
  );

  const assignableRoles = useMemo<AgencyRole[]>(
    () =>
      currentUserRole === "owner"
        ? ["owner", "manager", "recruiter", "finance", "read_only"]
        : ["recruiter", "finance", "read_only"],
    [currentUserRole],
  );

  const handleInvite = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startInviteTransition(async () => {
      try {
        const response = await fetch("/api/team/invites", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: inviteEmail.trim(),
            role: inviteRole,
          }),
        });

        const result = (await response.json().catch(() => null)) as {
          emailSent?: boolean;
          error?: string;
          inviteUrl?: string;
        } | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to create invite");
        }

        setInviteEmail("");
        setInviteRole(currentUserRole === "owner" ? "manager" : "recruiter");
        toast.success("Invite created", {
          description: result?.emailSent
            ? "Invite email sent."
            : "Invite created.",
        });
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to create invite",
        );
      }
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Invite teammate</h2>
          <p className="text-sm text-muted-foreground">
            Send an invite email to a new agency user.
          </p>
        </div>
        <form
          className="grid gap-4 p-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]"
          onSubmit={handleInvite}
        >
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={inviteRole}
              onValueChange={(value) => setInviteRole(value as AgencyRole)}
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {agencyRoleLabels[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isInviting}>
              {isInviting ? "Creating invite..." : "Create invite"}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Current team</h2>
          <p className="text-sm text-muted-foreground">
            Agency memberships already attached to this workspace.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.user_id}>
                  <TableCell>
                    {(
                      member.full_name ??
                      [member.first_name, member.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim()
                    ) || "Not set"}
                  </TableCell>
                  <TableCell>{member.email ?? "No email"}</TableCell>
                  <TableCell>{agencyRoleLabels[member.role]}</TableCell>
                  <TableCell>{dateFormatter.format(new Date(member.created_at))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Pending invites</h2>
          <p className="text-sm text-muted-foreground">
            Open invites for this agency that have not been accepted yet.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInvites.length > 0 ? (
                pendingInvites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>{agencyRoleLabels[invite.role]}</TableCell>
                    <TableCell>{dateFormatter.format(new Date(invite.created_at))}</TableCell>
                    <TableCell>{dateFormatter.format(new Date(invite.expires_at))}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No pending invites.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
