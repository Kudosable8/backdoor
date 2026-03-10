import {
  IMPORT_FIELD_DEFINITIONS,
  type ImportFieldKey,
  type ImportFieldMapping,
  type ImportPreviewResult,
  type ImportPreviewRow,
} from "./types";

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSubmissionDate(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsed = new Date(trimmedValue);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function extractDomain(urlValue: string) {
  const trimmedValue = urlValue.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    const url = new URL(
      trimmedValue.startsWith("http://") || trimmedValue.startsWith("https://")
        ? trimmedValue
        : `https://${trimmedValue}`,
    );

    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function buildDedupeKey(input: {
  candidateNameNormalized: string;
  clientCompanyNormalized: string;
  introducedRoleNormalized: string;
}) {
  return `${input.candidateNameNormalized}::${input.clientCompanyNormalized}::${input.introducedRoleNormalized}`;
}

export function validateMapping(mapping: ImportFieldMapping) {
  const missingRequiredFields = IMPORT_FIELD_DEFINITIONS.filter(
    (field) => field.required && !mapping[field.key],
  ).map((field) => field.label);

  return {
    isValid: missingRequiredFields.length === 0,
    missingRequiredFields,
  };
}

export function buildImportPreview(args: {
  existingDedupeKeys: Set<string>;
  mapping: ImportFieldMapping;
  rows: Record<string, string>[];
}): ImportPreviewResult {
  const { existingDedupeKeys, mapping, rows } = args;
  const seenInFile = new Map<string, number>();
  const previewRows: ImportPreviewRow[] = rows.map((sourceRow, index) => {
    const normalized: Record<string, string | null> = {};
    const errors: string[] = [];

    const getValue = (fieldKey: ImportFieldKey) => {
      const sourceHeader = mapping[fieldKey];

      return sourceHeader ? sourceRow[sourceHeader] ?? "" : "";
    };

    const candidateFullName = getValue("candidate_full_name").trim();
    const introducedRole = getValue("introduced_role").trim();
    const clientCompanyName = getValue("client_company_name").trim();
    const submissionDate = parseSubmissionDate(getValue("submission_date"));
    const candidateNameNormalized = normalizeText(candidateFullName);
    const clientCompanyNormalized = normalizeText(clientCompanyName);
    const introducedRoleNormalized = normalizeText(introducedRole);
    const dedupeKey =
      candidateNameNormalized && clientCompanyNormalized
        ? buildDedupeKey({
            candidateNameNormalized,
            clientCompanyNormalized,
            introducedRoleNormalized,
          })
        : null;

    normalized.candidate_full_name = candidateFullName || null;
    normalized.candidate_linkedin_url =
      getValue("candidate_linkedin_url").trim() || null;
    normalized.candidate_location = getValue("candidate_location").trim() || null;
    normalized.client_company_name = clientCompanyName || null;
    normalized.client_domain = extractDomain(getValue("client_website"));
    normalized.client_website = getValue("client_website").trim() || null;
    normalized.fee_term_reference = getValue("fee_term_reference").trim() || null;
    normalized.introduced_role = introducedRole || null;
    normalized.notes = getValue("notes").trim() || null;
    normalized.recruiter_name = getValue("recruiter_name").trim() || null;
    normalized.submission_date = submissionDate;

    if (!candidateFullName) {
      errors.push("Candidate full name is required.");
    }

    if (!introducedRole) {
      errors.push("Introduced role is required.");
    }

    if (!clientCompanyName) {
      errors.push("Client company name is required.");
    }

    if (getValue("submission_date").trim() && !submissionDate) {
      errors.push("Submission date could not be parsed.");
    }

    if (!candidateNameNormalized) {
      errors.push("Candidate full name could not be normalized.");
    }

    if (!clientCompanyNormalized) {
      errors.push("Client company name could not be normalized.");
    }

    if (!introducedRoleNormalized) {
      errors.push("Introduced role could not be normalized.");
    }

    let rowStatus: ImportPreviewRow["rowStatus"] = "ready";
    let duplicateOfRowNumber: number | null = null;
    let isExistingDuplicate = false;

    if (errors.length > 0) {
      rowStatus = "invalid";
    } else if (dedupeKey && existingDedupeKeys.has(dedupeKey)) {
      rowStatus = "duplicate";
      isExistingDuplicate = true;
      errors.push(
        `Duplicate detected against an existing imported row for candidate "${candidateFullName}", company "${clientCompanyName}", role "${introducedRole}".`,
      );
    } else if (dedupeKey && seenInFile.has(dedupeKey)) {
      rowStatus = "duplicate";
      duplicateOfRowNumber = seenInFile.get(dedupeKey) ?? null;
      errors.push(
        `Duplicate detected in this CSV. It matches row ${duplicateOfRowNumber} for candidate "${candidateFullName}", company "${clientCompanyName}", role "${introducedRole}".`,
      );
    }

    if (dedupeKey) {
      seenInFile.set(dedupeKey, index + 2);
    }

    return {
      dedupeKey,
      duplicateOfRowNumber,
      errors,
      isExistingDuplicate,
      normalized: {
        ...normalized,
        candidate_name_normalized: candidateNameNormalized || null,
        client_company_normalized: clientCompanyNormalized || null,
        introduced_role_normalized: introducedRoleNormalized || null,
      },
      rowNumber: index + 2,
      rowStatus,
      source: sourceRow,
    };
  });

  const invalidRows = previewRows.filter((row) => row.rowStatus === "invalid").length;
  const duplicateRows = previewRows.filter(
    (row) => row.rowStatus === "duplicate",
  ).length;
  const existingDuplicateRows = previewRows.filter(
    (row) => row.rowStatus === "duplicate" && row.isExistingDuplicate,
  ).length;
  const inFileDuplicateRows = previewRows.filter(
    (row) => row.rowStatus === "duplicate" && !row.isExistingDuplicate,
  ).length;

  return {
    duplicateRows,
    existingDuplicateRows,
    headers: Object.keys(rows[0] ?? {}),
    inFileDuplicateRows,
    invalidRows,
    readyRows: previewRows.filter((row) => row.rowStatus === "ready").length,
    rows: previewRows,
    totalRows: previewRows.length,
  };
}
