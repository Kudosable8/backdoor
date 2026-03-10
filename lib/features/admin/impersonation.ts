import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

export const IMPERSONATION_COOKIE_NAME = "bd_impersonation_session";
const IMPERSONATION_DURATION_MS = 1000 * 60 * 30;

export async function createImpersonationSession({
  superAdminUserId,
  targetUserId,
}: {
  superAdminUserId: string;
  targetUserId: string;
}) {
  const adminClient = createAdminClient();
  const expiresAt = new Date(Date.now() + IMPERSONATION_DURATION_MS).toISOString();
  const { data, error } = await adminClient
    .from("admin_impersonation_sessions")
    .insert({
      expires_at: expiresAt,
      super_admin_user_id: superAdminUserId,
      target_user_id: targetUserId,
    })
    .select("id, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create impersonation session");
  }

  return data;
}

export async function endImpersonationSession(sessionId: string) {
  const adminClient = createAdminClient();

  await adminClient
    .from("admin_impersonation_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("ended_at", null);
}

export async function setImpersonationCookie(sessionId: string, expiresAt: string) {
  const cookieStore = await cookies();

  cookieStore.set(IMPERSONATION_COOKIE_NAME, sessionId, {
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearImpersonationCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATION_COOKIE_NAME);
}

export async function getImpersonationContext() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("admin_impersonation_sessions")
    .select("id, super_admin_user_id, target_user_id, expires_at, ended_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (data.ended_at || new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return data;
}
