"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { agencyRoleLabels, type AgencyRole } from "@/lib/features/auth/types";

type InviteLookupResult = {
  agencyName: string;
  email: string;
  isAccepted: boolean;
  isExpired: boolean;
  role: AgencyRole;
};

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteToken = searchParams.get("invite")?.trim() ?? "";
  const [invite, setInvite] = useState<InviteLookupResult | null>(null);
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadInvite = async () => {
      if (!inviteToken) {
        setInvite(null);
        setError("A valid invite link is required to create an account.");
        setIsLoadingInvite(false);
        return;
      }

      setIsLoadingInvite(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/auth/sign-up?token=${encodeURIComponent(inviteToken)}`,
        );
        const result = (await response.json().catch(() => null)) as
          | ({ error?: string } & Partial<InviteLookupResult>)
          | null;

        if (!response.ok) {
          throw new Error(result?.error ?? "Unable to load invite");
        }

        if (isMounted) {
          setInvite(result as InviteLookupResult);
        }
      } catch (lookupError) {
        if (isMounted) {
          setInvite(null);
          setError(
            lookupError instanceof Error
              ? lookupError.message
              : "Unable to load invite",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingInvite(false);
        }
      }
    };

    void loadInvite();

    return () => {
      isMounted = false;
    };
  }, [inviteToken]);

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!inviteToken || !invite || invite.isAccepted || invite.isExpired) {
      return;
    }

    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: invite.email,
          token: inviteToken,
          password,
          repeatPassword,
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "An error occurred");
      }

      router.push("/auth/sign-up-success");
    } catch (signUpError) {
      setError(
        signUpError instanceof Error ? signUpError.message : "An error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isInviteInvalid =
    !invite || invite.isAccepted || invite.isExpired || isLoadingInvite;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Accept invite</CardTitle>
          <CardDescription>
            Create your account to join your agency workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="agency">Agency</Label>
                <Input
                  id="agency"
                  type="text"
                  value={invite?.agencyName ?? (isLoadingInvite ? "Loading..." : "")}
                  disabled
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  type="text"
                  value={invite?.role ? agencyRoleLabels[invite.role] : ""}
                  disabled
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={invite?.email ?? ""}
                  disabled
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isInviteInvalid || isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repeat-password">Repeat Password</Label>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                  disabled={isInviteInvalid || isLoading}
                />
              </div>
              {invite?.isAccepted ? (
                <p className="text-sm text-amber-600">
                  This invite has already been accepted.
                </p>
              ) : null}
              {invite?.isExpired ? (
                <p className="text-sm text-amber-600">
                  This invite has expired. Ask your agency manager for a new one.
                </p>
              ) : null}
              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              <Button
                type="submit"
                className="w-full"
                disabled={isInviteInvalid || isLoading}
              >
                {isLoading ? "Creating your account..." : "Create account"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/auth/login" className="underline underline-offset-4">
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
