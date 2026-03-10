import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAgencyRole } from "@/lib/features/auth/server";
import { parseCsv } from "@/lib/features/imports/csv";
import {
  buildImportPreview,
  validateMapping,
} from "@/lib/features/imports/normalize";
import { importFieldMappingSchema } from "@/lib/features/imports/schema";

const previewSchema = z.object({
  content: z.string().min(1, "CSV content is required"),
  fileName: z.string().trim().min(1, "File name is required"),
  mapping: importFieldMappingSchema,
});

export async function POST(request: Request) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter"]);
  const payload = await request.json().catch(() => null);
  const parsedPayload = previewSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid preview request" },
      { status: 400 },
    );
  }

  const mappingValidation = validateMapping(parsedPayload.data.mapping);

  if (!mappingValidation.isValid) {
    return NextResponse.json(
      {
        error: `Missing required mappings: ${mappingValidation.missingRequiredFields.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const parsedCsv = parseCsv(parsedPayload.data.content);
  const { data: existingRows, error } = await appUser.supabase
    .from("candidate_introductions")
    .select("dedupe_key")
    .eq("agency_id", appUser.agency.agencyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const existingDedupeKeys = new Set(
    (((existingRows as { dedupe_key: string }[] | null) ?? []).map(
      (row) => row.dedupe_key,
    )),
  );
  const preview = buildImportPreview({
    existingDedupeKeys,
    mapping: parsedPayload.data.mapping,
    rows: parsedCsv.rows,
  });

  return NextResponse.json({
    ...preview,
    fileName: parsedPayload.data.fileName,
  });
}
