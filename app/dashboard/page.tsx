import { DashboardView } from "@/components/features/dashboard/DashboardView";
import type { DashboardProfile } from "@/lib/features/dashboard/types";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const profile = (rawProfile as DashboardProfile | null) ?? null;

  const email = profile?.email ?? user.email ?? "No email available";
  const fullName = profile?.full_name ?? "Add your name";

  return <DashboardView email={email} fullName={fullName} userId={user.id} />;
}
