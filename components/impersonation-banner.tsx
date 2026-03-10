import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getImpersonationContext } from "@/lib/features/admin/impersonation";
import { StopImpersonationButton } from "./stop-impersonation-button";

export async function ImpersonationBanner() {
  const impersonationContext = await getImpersonationContext();

  if (!impersonationContext) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== impersonationContext.target_user_id) {
    return null;
  }

  const adminClient = createAdminClient();
  const { data: profileRows } = await adminClient
    .from("profiles")
    .select("id, email, full_name, first_name, last_name")
    .in("id", [
      impersonationContext.super_admin_user_id,
      impersonationContext.target_user_id,
    ]);
  const profileMap = new Map(
    (((profileRows as
      | {
          email: string | null;
          first_name: string | null;
          full_name: string | null;
          id: string;
          last_name: string | null;
        }[]
      | null) ?? [])).map((row) => [
      row.id,
      {
        email: row.email,
        name:
          row.full_name?.trim() ||
          [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
          row.email ||
          "Unknown user",
      },
    ]),
  );
  const superAdminName =
    profileMap.get(impersonationContext.super_admin_user_id)?.name ?? "super admin";
  const targetName =
    profileMap.get(impersonationContext.target_user_id)?.name ?? "user";

  return (
    <div className="border-b bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <p>
          Impersonating <span className="font-semibold">{targetName}</span> as{" "}
          <span className="font-semibold">{superAdminName}</span>.
        </p>
        <StopImpersonationButton />
      </div>
    </div>
  );
}
