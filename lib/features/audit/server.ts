import type { AppUserContext } from "@/lib/features/auth/server";

type AuditEntityType =
  | "admin_impersonation_session"
  | "agency_membership"
  | "agency_invite"
  | "case"
  | "case_evidence"
  | "case_export"
  | "case_note"
  | "import"
  | "import_mapping"
  | "outreach_message";

type AuditAction =
  | "created"
  | "drafted"
  | "ended"
  | "exported"
  | "saved"
  | "sent"
  | "updated";

export async function logAuditEvent({
  action,
  appUser,
  entityId,
  entityType,
  metadata = {},
}: {
  action: AuditAction;
  appUser: AppUserContext;
  entityId?: string | null;
  entityType: AuditEntityType;
  metadata?: Record<string, unknown>;
}) {
  if (!appUser.agency) {
    return;
  }

  const { error } = await appUser.supabase.from("audit_events").insert({
    action,
    actor_user_id: appUser.user.id,
    agency_id: appUser.agency.agencyId,
    entity_id: entityId ?? null,
    entity_type: entityType,
    metadata_json: metadata,
  });

  if (error) {
    console.error("Failed to write audit event", {
      action,
      entityId,
      entityType,
      message: error.message,
    });
  }
}
