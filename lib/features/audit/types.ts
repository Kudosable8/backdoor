export type AuditEventRow = {
  action: string;
  actor_name: string | null;
  created_at: string;
  entity_id: string | null;
  entity_type: string;
  id: string;
  metadata_json: Record<string, unknown>;
};
