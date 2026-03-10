import { NextResponse } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";
import { importFieldMappingSchema } from "@/lib/features/imports/schema";

const saveMappingSchema = z.object({
  mapping: importFieldMappingSchema,
  name: z.string().trim().min(1, "Mapping name is required").max(100),
});

export async function POST(request: Request) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter"]);
  const payload = await request.json().catch(() => null);
  const parsedPayload = saveMappingSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid mapping request" },
      { status: 400 },
    );
  }

  const { data: mappingRow, error } = await appUser.supabase.from("import_mappings").insert({
    agency_id: appUser.agency.agencyId,
    created_by: appUser.user.id,
    field_mapping_json: parsedPayload.data.mapping,
    name: parsedPayload.data.name,
  }).select("id").single();

  if (error || !mappingRow) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "saved",
    appUser,
    entityId: mappingRow.id,
    entityType: "import_mapping",
    metadata: {
      name: parsedPayload.data.name,
    },
  });

  return NextResponse.json({ success: true });
}
