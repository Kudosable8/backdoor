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

const COMPANY_SUFFIXES = [
  "limited",
  "ltd",
  "incorporated",
  "inc",
  "llc",
  "plc",
  "corp",
  "corporation",
  "co",
  "company",
  "holdings",
  "holding",
  "group",
] as const;

const ROLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bsr\b/g, "senior"],
  [/\bjr\b/g, "junior"],
  [/\bvp\b/g, "vice president"],
  [/\bswe\b/g, "software engineer"],
  [/\bsde\b/g, "software development engineer"],
  [/\bcto\b/g, "chief technology officer"],
  [/\bcfo\b/g, "chief financial officer"],
  [/\bceo\b/g, "chief executive officer"],
];

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

function normalizeCompanyName(value: string) {
  let normalized = normalizeText(value);

  for (const suffix of COMPANY_SUFFIXES) {
    normalized = normalized.replace(new RegExp(`\\b${suffix}\\b$`), "").trim();
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function normalizeRoleTitle(value: string) {
  let normalized = normalizeText(value);

  for (const [pattern, replacement] of ROLE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function parseOwnershipWindowDays(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/(\d+)\s*(day|days|week|weeks|month|months|mo|mos|year|years|yr|yrs)\b/);

  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1] ?? "", 10);
  const unit = match[2] ?? "";

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  if (unit.startsWith("day")) {
    return amount;
  }

  if (unit.startsWith("week")) {
    return amount * 7;
  }

  if (unit.startsWith("month") || unit === "mo" || unit === "mos") {
    return amount * 30;
  }

  if (unit.startsWith("year") || unit === "yr" || unit === "yrs") {
    return amount * 365;
  }

  return null;
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
    const clientCompanyNormalized = normalizeCompanyName(clientCompanyName);
    const introducedRoleNormalized = normalizeRoleTitle(introducedRole);
    const ownershipWindowDays = parseOwnershipWindowDays(
      getValue("fee_term_reference"),
    );
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
    normalized.ownership_window_days =
      ownershipWindowDays !== null ? String(ownershipWindowDays) : null;
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
