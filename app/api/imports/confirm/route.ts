import { NextResponse } from "next/server";
import { z } from "zod";

import { logAuditEvent } from "@/lib/features/audit/server";
import { requireAgencyRole } from "@/lib/features/auth/server";
import { parseCsv } from "@/lib/features/imports/csv";
import {
  buildDedupeKey,
  buildImportPreview,
  validateMapping,
} from "@/lib/features/imports/normalize";
import { importFieldMappingSchema } from "@/lib/features/imports/schema";

const confirmSchema = z.object({
  content: z.string().min(1, "CSV content is required"),
  fileName: z.string().trim().min(1, "File name is required"),
  mapping: importFieldMappingSchema,
  skipExistingDuplicates: z.boolean().optional().default(true),
});

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

export async function POST(request: Request) {
  const appUser = await requireAgencyRole(["owner", "manager", "recruiter"]);
  const payload = await request.json().catch(() => null);
  const parsedPayload = confirmSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: parsedPayload.error.issues[0]?.message ?? "Invalid import request" },
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
  const { data: existingRows, error: dedupeError } = await appUser.supabase
    .from("candidate_introductions")
    .select("dedupe_key")
    .eq("agency_id", appUser.agency.agencyId);

  if (dedupeError) {
    return NextResponse.json({ error: dedupeError.message }, { status: 400 });
  }

  const preview = buildImportPreview({
    existingDedupeKeys: new Set(
      (((existingRows as { dedupe_key: string }[] | null) ?? []).map(
        (row) => row.dedupe_key,
      )),
    ),
    mapping: parsedPayload.data.mapping,
    rows: parsedCsv.rows,
  });

  const { data: createdImport, error: importError } = await appUser.supabase
    .from("imports")
    .insert({
      agency_id: appUser.agency.agencyId,
      duplicate_row_count: preview.duplicateRows,
      invalid_row_count: preview.invalidRows,
      mapping_json: parsedPayload.data.mapping,
      original_filename: parsedPayload.data.fileName,
      row_count: preview.totalRows,
      status: preview.readyRows > 0
        ? preview.invalidRows > 0 || preview.duplicateRows > 0
          ? "completed_with_errors"
          : "completed"
        : "failed",
      uploaded_by: appUser.user.id,
      valid_row_count: preview.readyRows,
    })
    .select("id")
    .single();

  if (importError || !createdImport) {
    return NextResponse.json(
      { error: importError?.message ?? "Unable to create import" },
      { status: 400 },
    );
  }

  const importRowsPayload: {
    agency_id: string;
    candidate_introduction_id?: string;
    error_text?: string | null;
    import_id: string;
    normalized_row_json?: Record<string, string | null>;
    raw_row_json: Record<string, string>;
    row_number: number;
    status: "duplicate" | "imported" | "invalid";
  }[] = [];
  let duplicateCount = 0;
  let importedCount = 0;
  let invalidCount = 0;

  for (const row of preview.rows) {
    const allowExistingDuplicateImport =
      Boolean(row.dedupeKey) &&
      row.isExistingDuplicate &&
      !parsedPayload.data.skipExistingDuplicates;

    if (parsedPayload.data.skipExistingDuplicates && row.isExistingDuplicate) {
      duplicateCount += 1;
      importRowsPayload.push({
        agency_id: appUser.agency.agencyId,
        error_text: row.errors.join(" "),
        import_id: createdImport.id,
        normalized_row_json: row.normalized,
        raw_row_json: row.source,
        row_number: row.rowNumber,
        status: "duplicate",
      });
      continue;
    }

    if ((!allowExistingDuplicateImport && row.rowStatus !== "ready") || !row.dedupeKey) {
      if (row.rowStatus === "duplicate") {
        duplicateCount += 1;
      } else {
        invalidCount += 1;
      }
      importRowsPayload.push({
        agency_id: appUser.agency.agencyId,
        error_text: row.errors.join(" "),
        import_id: createdImport.id,
        normalized_row_json: row.normalized,
        raw_row_json: row.source,
        row_number: row.rowNumber,
        status: row.rowStatus === "duplicate" ? "duplicate" : "invalid",
      });
      continue;
    }

    const names = splitName(row.normalized.candidate_full_name ?? "");
    const { data: createdIntroduction, error: introductionError } =
      await appUser.supabase
        .from("candidate_introductions")
        .insert({
          agency_id: appUser.agency.agencyId,
          candidate_first_name: names.firstName,
          candidate_full_name: row.normalized.candidate_full_name,
          candidate_last_name: names.lastName,
          candidate_linkedin_url: row.normalized.candidate_linkedin_url,
          candidate_location: row.normalized.candidate_location,
          candidate_name_normalized: row.normalized.candidate_name_normalized,
          client_company_normalized: row.normalized.client_company_normalized,
          client_company_raw: row.normalized.client_company_name,
          client_domain: row.normalized.client_domain,
          client_website: row.normalized.client_website,
          dedupe_key: buildDedupeKey({
            candidateNameNormalized: row.normalized.candidate_name_normalized ?? "",
            clientCompanyNormalized: row.normalized.client_company_normalized ?? "",
            introducedRoleNormalized:
              row.normalized.introduced_role_normalized ?? "",
          }),
          fee_term_reference: row.normalized.fee_term_reference,
          import_id: createdImport.id,
          introduced_role_normalized: row.normalized.introduced_role_normalized,
          introduced_role_raw: row.normalized.introduced_role,
          notes: row.normalized.notes,
          recruiter_name: row.normalized.recruiter_name,
          submission_date: row.normalized.submission_date,
        })
        .select("id")
        .single();

    if (introductionError || !createdIntroduction) {
      invalidCount += 1;
      importRowsPayload.push({
        agency_id: appUser.agency.agencyId,
        error_text: introductionError?.message ?? "Unable to import row",
        import_id: createdImport.id,
        normalized_row_json: row.normalized,
        raw_row_json: row.source,
        row_number: row.rowNumber,
        status: "invalid",
      });
      continue;
    }

    const { data: createdCase, error: caseError } = await appUser.supabase
      .from("cases")
      .insert({
        agency_id: appUser.agency.agencyId,
        candidate_introduction_id: createdIntroduction.id,
        confidence: "low",
        status: "new",
      })
      .select("id")
      .single();

    if (caseError || !createdCase) {
      invalidCount += 1;
      await appUser.supabase
        .from("candidate_introductions")
        .delete()
        .eq("id", createdIntroduction.id);
      importRowsPayload.push({
        agency_id: appUser.agency.agencyId,
        error_text: caseError?.message ?? "Unable to create case for imported row",
        import_id: createdImport.id,
        normalized_row_json: row.normalized,
        raw_row_json: row.source,
        row_number: row.rowNumber,
        status: "invalid",
      });
      continue;
    }

    await appUser.supabase
      .from("candidate_introductions")
      .update({ case_id: createdCase.id })
      .eq("id", createdIntroduction.id);

    importedCount += 1;
    importRowsPayload.push({
      agency_id: appUser.agency.agencyId,
      candidate_introduction_id: createdIntroduction.id,
      import_id: createdImport.id,
      normalized_row_json: row.normalized,
      raw_row_json: row.source,
      row_number: row.rowNumber,
      status: "imported",
    });
  }

  if (importRowsPayload.length > 0) {
    const { error: importRowsError } = await appUser.supabase
      .from("import_rows")
      .insert(importRowsPayload);

    if (importRowsError) {
      return NextResponse.json({ error: importRowsError.message }, { status: 400 });
    }
  }

  const { error: updateImportError } = await appUser.supabase
    .from("imports")
    .update({
      duplicate_row_count: duplicateCount,
      invalid_row_count: invalidCount,
      status:
        importedCount > 0
          ? invalidCount > 0 || duplicateCount > 0
            ? "completed_with_errors"
            : "completed"
          : "failed",
      valid_row_count: importedCount,
    })
    .eq("id", createdImport.id);

  if (updateImportError) {
    return NextResponse.json({ error: updateImportError.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "created",
    appUser,
    entityId: createdImport.id,
    entityType: "import",
    metadata: {
      duplicateRows: duplicateCount,
      fileName: parsedPayload.data.fileName,
      invalidRows: invalidCount,
      skippedExistingDuplicates: parsedPayload.data.skipExistingDuplicates,
      validRows: importedCount,
    },
  });

  return NextResponse.json({
    duplicateRows: duplicateCount,
    importId: createdImport.id,
    invalidRows: invalidCount,
    success: true,
    validRows: importedCount,
  });
}
