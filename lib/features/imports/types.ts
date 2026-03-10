export const IMPORT_FIELD_DEFINITIONS = [
  { key: "candidate_full_name", label: "Candidate Full Name", required: true },
  { key: "introduced_role", label: "Introduced Role", required: true },
  { key: "client_company_name", label: "Client Company Name", required: true },
  { key: "submission_date", label: "Submission Date", required: false },
  { key: "recruiter_name", label: "Recruiter Name", required: false },
  { key: "candidate_linkedin_url", label: "Candidate LinkedIn URL", required: false },
  { key: "candidate_location", label: "Candidate Location", required: false },
  { key: "client_website", label: "Client Website", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "fee_term_reference", label: "Ownership / Fee Term Reference", required: false },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_DEFINITIONS)[number]["key"];

export type ImportFieldMapping = Partial<Record<ImportFieldKey, string>>;

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export type ImportPreviewRow = {
  dedupeKey: string | null;
  duplicateOfRowNumber?: number | null;
  errors: string[];
  isExistingDuplicate?: boolean;
  normalized: Record<string, string | null>;
  rowNumber: number;
  rowStatus: "ready" | "invalid" | "duplicate";
  source: Record<string, string>;
};

export type ImportPreviewResult = {
  duplicateRows: number;
  headers: string[];
  inFileDuplicateRows: number;
  invalidRows: number;
  existingDuplicateRows: number;
  readyRows: number;
  rows: ImportPreviewRow[];
  totalRows: number;
};

export type SavedImportMapping = {
  created_at: string;
  field_mapping_json: ImportFieldMapping;
  id: string;
  name: string;
};

export type ImportHistoryRow = {
  created_at: string;
  duplicate_row_count: number;
  id: string;
  invalid_row_count: number;
  original_filename: string;
  row_count: number;
  status: string;
  valid_row_count: number;
};
