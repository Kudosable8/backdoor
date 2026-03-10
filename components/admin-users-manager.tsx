"use client";

import { MoreHorizontal, Shield, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  agencyRoleLabels,
  type AgencyRole,
} from "@/lib/features/auth/types";
import type {
  AdminAgencyOption,
  AdminUserRow,
} from "@/lib/features/admin/types";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatLastSignedIn(lastSignedInAt: string | null) {
  if (!lastSignedInAt) {
    return "Never";
  }

  return dateFormatter.format(new Date(lastSignedInAt));
}

type AdminUsersManagerProps = {
  agencies: AdminAgencyOption[];
  users: AdminUserRow[];
};

export function AdminUsersManager({ agencies, users }: AdminUsersManagerProps) {
  const router = useRouter();
  const [isCreating, startCreateTransition] = useTransition();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<
    "delete" | "demote" | "impersonate" | "promote" | null
  >(null);
  const [newUser, setNewUser] = useState({
    agencyId: "none",
    agencyRole: "recruiter" as AgencyRole,
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    role: "member",
  });

  const handleCreateUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startCreateTransition(async () => {
      const payload = {
        ...newUser,
        agencyId: newUser.agencyId === "none" ? null : newUser.agencyId,
        agencyRole: newUser.agencyId === "none" ? null : newUser.agencyRole,
      };
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => null)) as {
        error?: string;
        hint?: string;
      } | null;

      if (!response.ok) {
        toast.error(result?.error ?? "Unable to create user", {
          description: result?.hint,
        });
        return;
      }

      setNewUser({
        agencyId: "none",
        agencyRole: "recruiter",
        email: "",
        firstName: "",
        lastName: "",
        password: "",
        role: "member",
      });
      toast.success("User added", {
        description: `${newUser.email} was created successfully.`,
      });
      router.refresh();
    });
  };

  const promoteToSuperAdmin = async (userId: string) => {
    await updateUserRole(userId, "super_admin");
  };

  const demoteToMember = async (userId: string) => {
    await updateUserRole(userId, "member");
  };

  const updateUserRole = async (
    userId: string,
    role: "member" | "super_admin",
  ) => {
    setActiveUserId(userId);
    setActiveAction(role === "super_admin" ? "promote" : "demote");

    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role,
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        error?: string;
        hint?: string;
      } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? result?.hint ?? "Unable to update role");
      }

      toast.success(
        role === "super_admin" ? "User promoted" : "User demoted",
        {
          description:
            role === "super_admin"
              ? "The user is now a super admin."
              : "The user is now a member.",
        },
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update role",
      );
    } finally {
      setActiveUserId(null);
      setActiveAction(null);
    }
  };

  const deleteUser = async (userId: string, email: string | null) => {
    const confirmed = window.confirm(
      `Delete ${email ?? "this user"}? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setActiveUserId(userId);
    setActiveAction("delete");

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "Unable to delete user");
      }

      toast.success("User deleted", {
        description: email ?? "The user was deleted successfully.",
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete user");
    } finally {
      setActiveUserId(null);
      setActiveAction(null);
    }
  };

  const impersonateUser = async (userId: string, email: string | null) => {
    const confirmed = window.confirm(
      `Log in as ${email ?? "this user"}? You will be able to return to your super admin session.`,
    );

    if (!confirmed) {
      return;
    }

    setActiveUserId(userId);
    setActiveAction("impersonate");

    try {
      const response = await fetch(`/api/admin/users/${userId}/impersonate`, {
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as
        | { actionLink?: string; error?: string }
        | null;

      if (!response.ok || !result?.actionLink) {
        throw new Error(result?.error ?? "Unable to impersonate user");
      }

      window.location.assign(result.actionLink);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to impersonate user",
      );
      setActiveUserId(null);
      setActiveAction(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Add User</h2>
          <p className="text-sm text-muted-foreground">
            Create a user with an initial password, optional super admin access,
            and an optional initial agency membership.
          </p>
        </div>
        <form
          className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,1fr)_auto]"
          onSubmit={handleCreateUser}
        >
          <div className="grid gap-2">
            <Label htmlFor="admin-user-email">Email</Label>
            <Input
              id="admin-user-email"
              type="email"
              required
              value={newUser.email}
              onChange={(event) =>
                setNewUser((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-user-role">Role</Label>
            <Select
              value={newUser.role}
              onValueChange={(value) =>
                setNewUser((current) => ({
                  ...current,
                  role: value,
                }))
              }
            >
              <SelectTrigger id="admin-user-role" className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-user-first-name">First Name</Label>
            <Input
              id="admin-user-first-name"
              type="text"
              value={newUser.firstName}
              onChange={(event) =>
                setNewUser((current) => ({
                  ...current,
                  firstName: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-user-last-name">Last Name</Label>
            <Input
              id="admin-user-last-name"
              type="text"
              value={newUser.lastName}
              onChange={(event) =>
                setNewUser((current) => ({
                  ...current,
                  lastName: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-user-password">Initial Password</Label>
            <Input
              id="admin-user-password"
              type="password"
              required
              minLength={8}
              value={newUser.password}
              onChange={(event) =>
                setNewUser((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-user-agency">Agency Membership</Label>
            <Select
              value={newUser.agencyId}
              onValueChange={(value) =>
                setNewUser((current) => ({
                  ...current,
                  agencyId: value,
                }))
              }
            >
              <SelectTrigger id="admin-user-agency" className="w-full">
                <SelectValue placeholder="No agency membership" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No agency membership</SelectItem>
                {agencies.map((agency) => (
                  <SelectItem key={agency.id} value={agency.id}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-user-agency-role">Agency Role</Label>
            <Select
              value={newUser.agencyRole}
              disabled={newUser.agencyId === "none"}
              onValueChange={(value) =>
                setNewUser((current) => ({
                  ...current,
                  agencyRole: value as AgencyRole,
                }))
              }
            >
              <SelectTrigger id="admin-user-agency-role" className="w-full">
                <SelectValue placeholder="Select an agency role" />
              </SelectTrigger>
              <SelectContent>
                {(["owner", "manager", "recruiter", "finance", "read_only"] as AgencyRole[]).map((role) => (
                  <SelectItem key={role} value={role}>
                    {agencyRoleLabels[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating user..." : "Add User"}
            </Button>
          </div>
        </form>
      </div>

      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Registered Users</h2>
          <p className="text-sm text-muted-foreground">
            Promote members to super admin directly from the list.
          </p>
        </div>
        <div className="w-full min-w-0 max-w-full overflow-x-auto p-4">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>First Name</TableHead>
                <TableHead>Last Name</TableHead>
                <TableHead>Agency</TableHead>
                <TableHead>Agency Role</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last Signed In</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((listedUser) => {
                const isAlreadySuperAdmin = listedUser.role === "super_admin";
                const isBusy = activeUserId === listedUser.id;

                return (
                  <TableRow key={listedUser.id}>
                    <TableCell className="font-mono text-xs">
                      {listedUser.id}
                    </TableCell>
                    <TableCell>{listedUser.email ?? "No email"}</TableCell>
                    <TableCell>{listedUser.first_name ?? "Not set"}</TableCell>
                    <TableCell>{listedUser.last_name ?? "Not set"}</TableCell>
                    <TableCell>{listedUser.agency_name ?? "No agency"}</TableCell>
                    <TableCell>
                      {listedUser.agency_role
                        ? agencyRoleLabels[listedUser.agency_role]
                        : "No role"}
                    </TableCell>
                    <TableCell>{listedUser.role ?? "member"}</TableCell>
                    <TableCell>
                      {formatLastSignedIn(listedUser.last_signed_in_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isBusy}
                          >
                            <MoreHorizontal />
                            <span className="sr-only">Open actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            disabled={isBusy}
                            onSelect={() => {
                              void impersonateUser(listedUser.id, listedUser.email);
                            }}
                          >
                            {isBusy && activeAction === "impersonate"
                              ? "Logging in..."
                              : "Login as user"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {isAlreadySuperAdmin ? (
                            <DropdownMenuItem
                              disabled={isBusy}
                              onSelect={() => {
                                void demoteToMember(listedUser.id);
                              }}
                            >
                              <Shield />
                              {isBusy && activeAction === "demote"
                                ? "Demoting..."
                                : "Demote to Member"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              disabled={isBusy}
                              onSelect={() => {
                                void promoteToSuperAdmin(listedUser.id);
                              }}
                            >
                              <Shield />
                              {isBusy && activeAction === "promote"
                                ? "Promoting..."
                                : "Promote to Super Admin"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={isBusy}
                            onSelect={() => {
                              void deleteUser(listedUser.id, listedUser.email);
                            }}
                          >
                            <Trash2 />
                            {isBusy && activeAction === "delete"
                              ? "Deleting..."
                              : "Delete User"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
