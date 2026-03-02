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
import type { AdminUserRow } from "@/lib/features/admin/types";

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
  users: AdminUserRow[];
};

export function AdminUsersManager({ users }: AdminUsersManagerProps) {
  const router = useRouter();
  const [isCreating, startCreateTransition] = useTransition();
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    role: "member",
  });

  const handleCreateUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    startCreateTransition(async () => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newUser),
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
    setPromotingUserId(userId);

    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "super_admin",
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        error?: string;
        hint?: string;
      } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? result?.hint ?? "Unable to update role");
      }

      toast.success("User promoted", {
        description: "The user is now a super admin.",
      });
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update role",
      );
    } finally {
      setPromotingUserId(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="min-w-0 rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Add User</h2>
          <p className="text-sm text-muted-foreground">
            Create a user with an initial password and assign a role.
          </p>
        </div>
        <form
          className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_auto]"
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
                <TableHead>Role</TableHead>
                <TableHead>Last Signed In</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((listedUser) => {
                const isAlreadySuperAdmin = listedUser.role === "super_admin";
                const isPromoting = promotingUserId === listedUser.id;

                return (
                  <TableRow key={listedUser.id}>
                    <TableCell className="font-mono text-xs">
                      {listedUser.id}
                    </TableCell>
                    <TableCell>{listedUser.email ?? "No email"}</TableCell>
                    <TableCell>{listedUser.first_name ?? "Not set"}</TableCell>
                    <TableCell>{listedUser.last_name ?? "Not set"}</TableCell>
                    <TableCell>{listedUser.role ?? "member"}</TableCell>
                    <TableCell>
                      {formatLastSignedIn(listedUser.last_signed_in_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAlreadySuperAdmin ? (
                        <span className="text-sm text-muted-foreground">
                          Super admin
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={isPromoting}
                          onClick={() => promoteToSuperAdmin(listedUser.id)}
                        >
                          {isPromoting
                            ? "Promoting..."
                            : "Promote to Super Admin"}
                        </Button>
                      )}
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
