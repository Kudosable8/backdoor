import type { AppUserContext } from "@/lib/features/auth/server";
import { searchWebWithBrave } from "@/lib/brave/search";
import { findAndVerifyBusinessEmail } from "@/lib/hunter/client";
import { logAuditEvent } from "@/lib/features/audit/server";
import {
  clampScore,
  getScoreBand,
  getScoreRule,
  type CaseEvidenceType,
  type CaseEvidenceStrength,
} from "@/lib/features/cases/scoring";

export const CASE_CHECK_TYPES = [
  "company_site_homepage",
  "company_site_about",
  "company_site_team",
  "public_web_candidate_company",
  "public_web_candidate_role_company",
  "company_email_lookup",
] as const;

export const CASE_CHECK_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "skipped",
] as const;

export const CASE_RESEARCH_STATUSES = [
  "not_started",
  "queued",
  "in_progress",
  "completed",
  "failed",
] as const;
export const RESEARCH_ERROR_CODES = [
  "missing_client_website",
  "missing_candidate_name",
  "fetch_timeout",
  "http_error",
  "non_html_page",
  "brave_api_error",
  "hunter_api_error",
  "fetch_error",
  "unknown_error",
] as const;
export const RESEARCH_CHECK_OUTCOMES = [
  "matched",
  "no_match_found",
  "missing_source",
  "error",
] as const;
export const MAX_RESEARCH_CHECK_ATTEMPTS = 3;

export type CaseCheckType = (typeof CASE_CHECK_TYPES)[number];
export type CaseCheckStatus = (typeof CASE_CHECK_STATUSES)[number];
export type CaseResearchStatus = (typeof CASE_RESEARCH_STATUSES)[number];
export type ResearchErrorCode = (typeof RESEARCH_ERROR_CODES)[number];
export type ResearchCheckOutcome = (typeof RESEARCH_CHECK_OUTCOMES)[number];
type PublicWebCheckType = Extract<
  CaseCheckType,
  "public_web_candidate_company" | "public_web_candidate_role_company"
>;

export const caseCheckTypeLabels: Record<CaseCheckType, string> = {
  company_site_about: "Company Site About Page",
  company_site_homepage: "Company Site Homepage",
  company_site_team: "Company Site Team Page",
  company_email_lookup: "Company Email Lookup",
  public_web_candidate_company: "Public Web Candidate + Company Search",
  public_web_candidate_role_company: "Public Web Candidate + Role + Company Search",
};

export const caseCheckStatusLabels: Record<CaseCheckStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  pending: "Pending",
  processing: "Processing",
  skipped: "Skipped",
};

export const caseResearchStatusLabels: Record<CaseResearchStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  in_progress: "In Progress",
  not_started: "Not Started",
  queued: "Queued",
};
export const researchErrorLabels: Record<ResearchErrorCode, string> = {
  hunter_api_error: "Hunter API Error",
  missing_client_website: "Missing Client Website",
  missing_candidate_name: "Missing Candidate Name",
  fetch_timeout: "Fetch Timeout",
  http_error: "HTTP Error",
  non_html_page: "Non-HTML Page",
  brave_api_error: "Brave API Error",
  fetch_error: "Fetch Error",
  unknown_error: "Unknown Error",
};
export const transientResearchErrorCodes: ResearchErrorCode[] = [
  "fetch_timeout",
  "http_error",
  "brave_api_error",
  "hunter_api_error",
  "fetch_error",
];
export const researchCheckOutcomeLabels: Record<ResearchCheckOutcome, string> = {
  error: "Error",
  matched: "Matched",
  missing_source: "Missing Source",
  no_match_found: "No Match Found",
};

type ResearchSourceInput = {
  clientDomain: string | null;
  clientWebsite: string | null;
};

type PublicWebSearchResult = {
  dedupedAgainstExistingSource?: boolean;
  query: string;
  snippet: string | null;
  strength: CaseEvidenceStrength | null;
  title: string;
  url: string;
};

type EnqueueCaseResearchChecksArgs = ResearchSourceInput & {
  agencyId: string;
  caseId: string;
  supabase: AppUserContext["supabase"];
};

type ProcessPendingCaseChecksArgs = {
  appUser: AppUserContext;
  caseId?: string;
  limit?: number;
  triggerSource?: "manual" | "cron" | "case_manual";
};

type CaseCheckRecord = {
  agency_id: string;
  attempt_count: number;
  case_id: string;
  check_type: CaseCheckType;
  completed_at: string | null;
  error_text: string | null;
  id: string;
  result_json: Record<string, unknown> | null;
  source_url: string | null;
  started_at: string | null;
  status: CaseCheckStatus;
};

type ResearchRunSummary = {
  completed: number;
  evidenceCreated: number;
  failed: number;
  processed: number;
  skipped: number;
};

type CaseEvidenceScoreRow = {
  evidence_type: CaseEvidenceType;
  score_delta: number;
  strength: CaseEvidenceStrength;
};

type CaseResearchContext = {
  candidateFullName: string;
  candidateFirstName: string | null;
  candidateLastName: string | null;
  candidateNameNormalized: string | null;
  clientCompanyRaw: string;
  clientDomain: string | null;
  clientWebsite: string | null;
  introducedRoleRaw: string;
  ownershipWindowDays: number | null;
  submissionDate: string | null;
};

const COMMON_FIRST_NAMES = new Set([
  "alex",
  "chris",
  "daniel",
  "david",
  "emma",
  "james",
  "john",
  "maria",
  "michael",
  "olivia",
  "sarah",
]);

const COMMON_LAST_NAMES = new Set([
  "brown",
  "davis",
  "garcia",
  "johnson",
  "jones",
  "miller",
  "smith",
  "taylor",
  "williams",
  "wilson",
]);

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Automated research failed";
}

function categorizeResearchError(error: unknown): ResearchErrorCode {
  const message = getErrorMessage(error).toLowerCase();

  if (message.includes("missing_client_website")) {
    return "missing_client_website";
  }

  if (message.includes("missing_candidate_name")) {
    return "missing_candidate_name";
  }

  if (message.includes("timeout")) {
    return "fetch_timeout";
  }

  if (message.includes("expected html") || message.includes("non-html")) {
    return "non_html_page";
  }

  if (message.includes("brave search failed")) {
    return "brave_api_error";
  }

  if (message.includes("hunter api failed") || message.includes("hunter request failed")) {
    return "hunter_api_error";
  }

  if (message.includes("http ")) {
    return "http_error";
  }

  if (message.includes("fetch")) {
    return "fetch_error";
  }

  return "unknown_error";
}

function ensureAbsoluteUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `https://${value}`,
    );

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildCheckSourceUrl(
  checkType: CaseCheckType,
  source: ResearchSourceInput,
) {
  if (
    checkType === "company_email_lookup" ||
    checkType === "public_web_candidate_company" ||
    checkType === "public_web_candidate_role_company"
  ) {
    return null;
  }

  const normalizedWebsite = ensureAbsoluteUrl(source.clientWebsite);
  const baseUrl =
    normalizedWebsite ??
    (source.clientDomain ? ensureAbsoluteUrl(source.clientDomain) : null);

  if (!baseUrl) {
    return null;
  }

  const url = new URL(baseUrl);

  if (checkType === "company_site_about") {
    url.pathname = "/about";
  }

  if (checkType === "company_site_team") {
    url.pathname = "/team";
  }

  return url.toString();
}

function getCheckPriority(checkType: CaseCheckType) {
  if (checkType === "company_site_homepage") {
    return 10;
  }

  if (checkType === "public_web_candidate_company") {
    return 15;
  }

  if (checkType === "company_email_lookup") {
    return 18;
  }

  if (checkType === "company_site_team") {
    return 20;
  }

  if (checkType === "public_web_candidate_role_company") {
    return 25;
  }

  return 30;
}

export async function enqueueCaseResearchChecks({
  agencyId,
  caseId,
  clientDomain,
  clientWebsite,
  supabase,
}: EnqueueCaseResearchChecksArgs) {
  const checks = CASE_CHECK_TYPES.map((checkType) => ({
    agency_id: agencyId,
    case_id: caseId,
    check_type: checkType,
    priority: getCheckPriority(checkType),
    source_url: buildCheckSourceUrl(checkType, { clientDomain, clientWebsite }),
    status: "pending" as const,
  })).filter((check) =>
    check.check_type === "company_email_lookup" ||
    check.check_type === "public_web_candidate_company" ||
    check.check_type === "public_web_candidate_role_company"
      ? true
      : Boolean(check.source_url),
  );

  if (checks.length === 0) {
    await supabase
      .from("cases")
      .update({
        researched_at: new Date().toISOString(),
        research_started_at: null,
        research_status: "completed",
      })
      .eq("agency_id", agencyId)
      .eq("id", caseId);

    return { createdCount: 0 };
  }

  const { data: existingChecks, error: existingError } = await supabase
    .from("case_checks")
    .select("check_type")
    .eq("agency_id", agencyId)
    .eq("case_id", caseId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingTypes = new Set(
    (((existingChecks as { check_type: CaseCheckType }[] | null) ?? []).map(
      (row) => row.check_type,
    )),
  );
  const checksToInsert = checks.filter((check) => !existingTypes.has(check.check_type));

  if (checksToInsert.length === 0) {
    return { createdCount: 0 };
  }

  const { error } = await supabase.from("case_checks").insert(checksToInsert);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("cases")
    .update({
      research_started_at: null,
      research_status: "queued",
    })
    .eq("agency_id", agencyId)
    .eq("id", caseId);

  return { createdCount: checksToInsert.length };
}

async function getCaseResearchContext(args: {
  agencyId: string;
  caseId: string;
  supabase: AppUserContext["supabase"];
}): Promise<CaseResearchContext> {
  const { data, error } = await args.supabase
    .from("cases")
    .select(
      "candidate_introductions!cases_candidate_introduction_id_fkey(candidate_full_name, candidate_name_normalized, client_company_raw, client_domain, client_website, introduced_role_raw, ownership_window_days, submission_date)",
    )
    .eq("agency_id", args.agencyId)
    .eq("id", args.caseId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const introductionJoin = (
    data as
      | {
          candidate_introductions:
            | {
                candidate_full_name: string;
                candidate_name_normalized: string | null;
                client_company_raw: string;
                client_domain: string | null;
                client_website: string | null;
                introduced_role_raw: string;
                ownership_window_days: number | null;
                submission_date: string | null;
              }
            | {
                candidate_full_name: string;
                candidate_name_normalized: string | null;
                client_company_raw: string;
                client_domain: string | null;
                client_website: string | null;
                introduced_role_raw: string;
                ownership_window_days: number | null;
                submission_date: string | null;
              }[]
            | null;
        }
      | null
  )?.candidate_introductions;
  const introduction = Array.isArray(introductionJoin)
    ? introductionJoin[0] ?? null
    : introductionJoin;

  if (!introduction) {
    throw new Error("Unable to load case introduction context");
  }

  return {
    candidateFullName: introduction.candidate_full_name,
    candidateFirstName: getNameTokens(
      introduction.candidate_name_normalized,
      introduction.candidate_full_name,
    )[0] ?? null,
    candidateLastName: getNameTokens(
      introduction.candidate_name_normalized,
      introduction.candidate_full_name,
    )[1] ?? null,
    candidateNameNormalized: introduction.candidate_name_normalized,
    clientCompanyRaw: introduction.client_company_raw,
    clientDomain: introduction.client_domain,
    clientWebsite: introduction.client_website,
    introducedRoleRaw: introduction.introduced_role_raw,
    ownershipWindowDays: introduction.ownership_window_days,
    submissionDate: introduction.submission_date,
  };
}

function getOwnershipWindowStatus(args: {
  ownershipWindowDays: number | null;
  submissionDate: string | null;
}) {
  if (!args.ownershipWindowDays || !args.submissionDate) {
    return "unknown" as const;
  }

  const submittedAt = new Date(args.submissionDate);

  if (Number.isNaN(submittedAt.getTime())) {
    return "unknown" as const;
  }

  const expiresAt = submittedAt.getTime() + args.ownershipWindowDays * 24 * 60 * 60 * 1000;

  return Date.now() <= expiresAt ? ("within_window" as const) : ("outside_window" as const);
}

function downgradeStrength(strength: CaseEvidenceStrength) {
  if (strength === "strong") {
    return "medium";
  }

  if (strength === "medium") {
    return "weak";
  }

  return null;
}

export async function ensureCaseResearchChecks(args: {
  agencyId: string;
  caseId: string;
  supabase: AppUserContext["supabase"];
}) {
  const context = await getCaseResearchContext(args);

  return enqueueCaseResearchChecks({
    agencyId: args.agencyId,
    caseId: args.caseId,
    clientDomain: context.clientDomain,
    clientWebsite: context.clientWebsite,
    supabase: args.supabase,
  });
}

function extractSnippet(text: string, searchTerm: string) {
  const haystack = normalizeSearchText(text);
  const needle = normalizeSearchText(searchTerm);

  if (!needle) {
    return truncate(text, 280);
  }

  const index = haystack.indexOf(needle);

  if (index < 0) {
    return truncate(text, 280);
  }

  const rawIndex = text.toLowerCase().indexOf(searchTerm.toLowerCase());
  const start = Math.max(0, (rawIndex >= 0 ? rawIndex : index) - 80);
  const end = Math.min(text.length, start + 240);

  return truncate(text.slice(start, end).trim(), 280);
}

function analyzeCompanyPage(args: {
  candidateFullName: string;
  checkType: CaseCheckType;
  clientCompanyRaw: string;
  introducedRoleRaw: string;
  pageText: string;
}) {
  const normalizedText = normalizeSearchText(args.pageText);
  const normalizedCandidate = normalizeSearchText(args.candidateFullName);
  const normalizedRole = normalizeSearchText(args.introducedRoleRaw);
  const normalizedCompany = normalizeSearchText(args.clientCompanyRaw);
  const candidateFound = normalizedCandidate
    ? normalizedText.includes(normalizedCandidate)
    : false;
  const roleFound = normalizedRole
    ? normalizedText.includes(normalizedRole)
    : false;
  const companyFound = normalizedCompany
    ? normalizedText.includes(normalizedCompany)
    : false;

  let strength: CaseEvidenceStrength | null = null;

  if (candidateFound && roleFound) {
    strength = "strong";
  } else if (candidateFound && args.checkType !== "company_site_homepage") {
    strength = "medium";
  } else if (candidateFound) {
    strength = "weak";
  }

  return {
    candidateFound,
    companyFound,
    roleFound,
    snippet: candidateFound
      ? extractSnippet(args.pageText, args.candidateFullName)
      : truncate(args.pageText, 220),
    strength,
  };
}

function getNameTokens(candidateNameNormalized: string | null, fallbackFullName: string) {
  const normalized = candidateNameNormalized ?? normalizeSearchText(fallbackFullName);

  return normalized.split(" ").filter(Boolean);
}

function getCandidateAmbiguityLevel(args: {
  candidateFullName: string;
  candidateNameNormalized: string | null;
}) {
  const tokens = getNameTokens(args.candidateNameNormalized, args.candidateFullName);
  const [firstName = "", lastName = ""] = tokens;

  if (tokens.length < 2 || lastName.length < 3) {
    return "high";
  }

  if (COMMON_FIRST_NAMES.has(firstName) && COMMON_LAST_NAMES.has(lastName)) {
    return "high";
  }

  if (COMMON_FIRST_NAMES.has(firstName) || COMMON_LAST_NAMES.has(lastName)) {
    return "medium";
  }

  return "low";
}

function buildPublicWebQueries(args: {
  candidateFullName: string;
  candidateNameNormalized: string | null;
  checkType: CaseCheckType;
  clientCompanyRaw: string;
  clientDomain: string | null;
  introducedRoleRaw: string;
}) {
  const [firstName = "", lastName = ""] = getNameTokens(
    args.candidateNameNormalized,
    args.candidateFullName,
  );
  const queries = new Set<string>();

  if (args.checkType === "public_web_candidate_role_company") {
    queries.add(
      `"${args.candidateFullName}" "${args.introducedRoleRaw}" "${args.clientCompanyRaw}"`,
    );
    if (lastName) {
      queries.add(
        `"${firstName} ${lastName}" "${args.introducedRoleRaw}" "${args.clientCompanyRaw}"`,
      );
    }
  } else {
    queries.add(`"${args.candidateFullName}" "${args.clientCompanyRaw}"`);
    if (lastName) {
      queries.add(`"${firstName} ${lastName}" "${args.clientCompanyRaw}"`);
    }
  }

  if (args.clientDomain) {
    queries.add(
      `"${args.candidateFullName}" site:${args.clientDomain}`,
    );
    if (args.checkType === "public_web_candidate_role_company") {
      queries.add(
        `"${args.candidateFullName}" "${args.introducedRoleRaw}" site:${args.clientDomain}`,
      );
    }
  }

  return Array.from(queries);
}

function analyzePublicWebHit(args: {
  candidateFullName: string;
  candidateNameNormalized: string | null;
  clientCompanyRaw: string;
  clientDomain: string | null;
  hit: {
    snippet: string | null;
    title: string;
    url: string;
  };
  introducedRoleRaw: string;
}) {
  const combinedText = [args.hit.title, args.hit.snippet ?? "", args.hit.url].join(" ");
  const normalizedCombined = normalizeSearchText(combinedText);
  const [firstName = "", lastName = ""] = getNameTokens(
    args.candidateNameNormalized,
    args.candidateFullName,
  );
  const fullNameNeedle = normalizeSearchText(args.candidateFullName);
  const candidateFound = normalizedCombined.includes(fullNameNeedle);
  const lastNameFound = lastName ? normalizedCombined.includes(lastName) : false;
  const firstNameFound = firstName ? normalizedCombined.includes(firstName) : false;
  const companyFound = normalizedCombined.includes(
    normalizeSearchText(args.clientCompanyRaw),
  );
  const roleFound = normalizeSearchText(args.introducedRoleRaw)
    ? normalizedCombined.includes(normalizeSearchText(args.introducedRoleRaw))
    : false;
  const domainFound = args.clientDomain
    ? ensureAbsoluteUrl(args.hit.url)?.includes(args.clientDomain) ?? false
    : false;

  let strength: CaseEvidenceStrength | null = null;
  const ambiguityLevel = getCandidateAmbiguityLevel({
    candidateFullName: args.candidateFullName,
    candidateNameNormalized: args.candidateNameNormalized,
  });

  if (ambiguityLevel === "high") {
    if (candidateFound && lastNameFound && roleFound && (companyFound || domainFound)) {
      strength = "weak";
    }
  } else if (ambiguityLevel === "medium") {
    if (candidateFound && roleFound && (companyFound || domainFound)) {
      strength = "weak";
    } else if (candidateFound && lastNameFound && domainFound && roleFound) {
      strength = "weak";
    }
  } else if (candidateFound && roleFound && (companyFound || domainFound)) {
    strength = "medium";
  } else if (candidateFound && firstNameFound && lastNameFound && (companyFound || domainFound)) {
    strength = "weak";
  }

  return {
    candidateFound,
    companyFound,
    domainFound,
    ambiguityLevel,
    lastNameFound,
    roleFound,
    strength,
  };
}

async function runPublicWebSearch(args: {
  candidateFullName: string;
  candidateNameNormalized: string | null;
  checkType: PublicWebCheckType;
  clientCompanyRaw: string;
  clientDomain: string | null;
  introducedRoleRaw: string;
}) {
  const queries = buildPublicWebQueries(args);

  for (const query of queries) {
    const hits = await searchWebWithBrave({
      count: 5,
      query,
    });

    for (const hit of hits) {
      const analysis = analyzePublicWebHit({
        candidateFullName: args.candidateFullName,
        candidateNameNormalized: args.candidateNameNormalized,
        clientCompanyRaw: args.clientCompanyRaw,
        clientDomain: args.clientDomain,
        hit,
        introducedRoleRaw: args.introducedRoleRaw,
      });

      if (analysis.strength) {
        return {
          query,
          snippet: hit.snippet,
          strength: analysis.strength,
          title: hit.title,
          url: hit.url,
        } satisfies PublicWebSearchResult;
      }
    }

    if (hits[0]) {
      return {
        query,
        snippet: hits[0]?.snippet ?? null,
        strength: null,
        title: hits[0]?.title ?? "No strong public-web match found",
        url: hits[0]?.url ?? "",
      } satisfies PublicWebSearchResult;
    }
  }

  return {
    query: queries[0] ?? args.candidateFullName,
    snippet: null,
    strength: null,
    title: "No strong public-web match found",
    url: "",
  } satisfies PublicWebSearchResult;
}

async function hasExistingEvidenceSource(args: {
  agencyId: string;
  caseId: string;
  sourceUrl: string;
  supabase: AppUserContext["supabase"];
}) {
  const { data, error } = await args.supabase
    .from("case_evidence")
    .select("id")
    .eq("agency_id", args.agencyId)
    .eq("case_id", args.caseId)
    .eq("source_url", args.sourceUrl)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function fetchPageText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "BackdoorHireResearchBot/1.0 (+https://backdoorhire.app)",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("text/html")) {
    throw new Error("Expected HTML content");
  }

  const html = await response.text();

  return stripHtml(html);
}

export async function recalculateCaseScore(args: {
  agencyId: string;
  caseId: string;
  supabase: AppUserContext["supabase"];
}) {
  const { data: evidenceRows, error: aggregateError } = await args.supabase
    .from("case_evidence")
    .select("evidence_type, score_delta, strength")
    .eq("agency_id", args.agencyId)
    .eq("case_id", args.caseId);

  if (aggregateError) {
    throw new Error(aggregateError.message);
  }

  const typedEvidenceRows =
    ((evidenceRows as CaseEvidenceScoreRow[] | null) ?? []);
  const currentScore = clampScore(
    (typedEvidenceRows.reduce(
      (total, row) => total + row.score_delta,
      0,
    )),
  );
  const scoreBand = getGuardrailedScoreBand({
    evidenceRows: typedEvidenceRows,
    score: currentScore,
  });
  const { error: caseUpdateError } = await args.supabase
    .from("cases")
    .update({
      confidence: scoreBand,
      current_score: currentScore,
      last_activity_at: new Date().toISOString(),
      score_band: scoreBand,
    })
    .eq("agency_id", args.agencyId)
    .eq("id", args.caseId);

  if (caseUpdateError) {
    throw new Error(caseUpdateError.message);
  }

  return {
    currentScore,
    scoreBand,
  };
}

function hasStrongCorroboration(evidenceRows: CaseEvidenceScoreRow[]) {
  const positiveRows = evidenceRows.filter((row) => row.score_delta > 0);

  if (positiveRows.length < 2) {
    return false;
  }

  const positiveTypes = new Set(positiveRows.map((row) => row.evidence_type));

  if (positiveTypes.has("company_site")) {
    return true;
  }

  if (positiveTypes.has("uploaded_file")) {
    return true;
  }

  if (positiveTypes.has("email_signal") && positiveTypes.size === 1) {
    return false;
  }

  if (
    positiveTypes.size === 2 &&
    positiveTypes.has("public_web") &&
    positiveTypes.has("email_signal")
  ) {
    return false;
  }

  return positiveTypes.size >= 2 && !(positiveTypes.size === 1 && positiveTypes.has("public_web"));
}

function getGuardrailedScoreBand(args: {
  evidenceRows: CaseEvidenceScoreRow[];
  score: number;
}) {
  const baseBand = getScoreBand(args.score);
  const positiveRows = args.evidenceRows.filter((row) => row.score_delta > 0);
  const positiveTypes = new Set(positiveRows.map((row) => row.evidence_type));
  const publicWebOnly =
    positiveRows.length > 0 &&
    positiveTypes.size === 1 &&
    positiveTypes.has("public_web");
  const emailOnly =
    positiveRows.length > 0 &&
    positiveTypes.size === 1 &&
    positiveTypes.has("email_signal");

  if (publicWebOnly && baseBand === "high") {
    return "medium";
  }

  if (emailOnly && baseBand !== "low") {
    return "low";
  }

  if (baseBand === "high" && !hasStrongCorroboration(args.evidenceRows)) {
    return "medium";
  }

  return baseBand;
}

export async function getCaseContactReadiness(args: {
  agencyId: string;
  caseId: string;
  supabase: AppUserContext["supabase"];
}) {
  const { data, error } = await args.supabase
    .from("case_evidence")
    .select("evidence_type, score_delta, strength")
    .eq("agency_id", args.agencyId)
    .eq("case_id", args.caseId);

  if (error) {
    throw new Error(error.message);
  }

  const evidenceRows = ((data as CaseEvidenceScoreRow[] | null) ?? []);
  const currentScore = clampScore(
    evidenceRows.reduce((total, row) => total + row.score_delta, 0),
  );
  const scoreBand = getGuardrailedScoreBand({
    evidenceRows,
    score: currentScore,
  });
  const hasCorroboration = hasStrongCorroboration(evidenceRows);

  return {
    canContact: scoreBand !== "low" && hasCorroboration,
    hasCorroboration,
    scoreBand,
  };
}

async function createResearchRun(args: {
  appUser: AppUserContext;
  caseId?: string;
  triggerSource: "manual" | "cron" | "case_manual";
}) {
  const { data, error } = await args.appUser.supabase
    .from("research_runs")
    .insert({
      agency_id: args.appUser.agency!.agencyId,
      metadata_json: args.caseId ? { caseId: args.caseId } : {},
      trigger_source: args.triggerSource,
      triggered_by_user_id: args.appUser.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to start research run");
  }

  return data.id as string;
}

async function finalizeResearchRun(args: {
  appUser: AppUserContext;
  errorText?: string;
  runId: string;
  status: "completed" | "failed";
  summary: ResearchRunSummary;
}) {
  const { error } = await args.appUser.supabase
    .from("research_runs")
    .update({
      completed_at: new Date().toISOString(),
      completed_checks_count: args.summary.completed,
      evidence_created_count: args.summary.evidenceCreated,
      failed_checks_count: args.summary.failed,
      processed_checks_count: args.summary.processed,
      skipped_checks_count: args.summary.skipped,
      status: args.status,
      error_text: args.errorText ?? null,
    })
    .eq("id", args.runId)
    .eq("agency_id", args.appUser.agency!.agencyId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateCaseResearchStatus(args: {
  agencyId: string;
  caseId: string;
  supabase: AppUserContext["supabase"];
}) {
  const { data: checkRows, error } = await args.supabase
    .from("case_checks")
    .select("status")
    .eq("agency_id", args.agencyId)
    .eq("case_id", args.caseId);

  if (error) {
    throw new Error(error.message);
  }

  const statuses = ((checkRows as { status: CaseCheckStatus }[] | null) ?? []).map(
    (row) => row.status,
  );
  const now = new Date().toISOString();
  let researchStatus: CaseResearchStatus = "not_started";
  let researchedAt: string | null = null;
  let researchStartedAt: string | null = null;

  if (statuses.length === 0) {
    researchStatus = "completed";
    researchedAt = now;
  } else if (statuses.some((status) => status === "processing")) {
    researchStatus = "in_progress";
    researchStartedAt = now;
  } else if (statuses.some((status) => status === "pending")) {
    researchStatus = "queued";
  } else if (statuses.every((status) => status === "completed" || status === "skipped")) {
    researchStatus = "completed";
    researchedAt = now;
  } else if (statuses.some((status) => status === "failed")) {
    researchStatus = "failed";
    researchedAt = now;
  }

  const { error: updateError } = await args.supabase
    .from("cases")
    .update({
      researched_at: researchedAt,
      research_started_at: researchStartedAt,
      research_status: researchStatus,
    })
    .eq("agency_id", args.agencyId)
    .eq("id", args.caseId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function processSingleCaseCheck(args: {
  appUser: AppUserContext;
  check: CaseCheckRecord;
}) {
  const { appUser, check } = args;
  const context = await getCaseResearchContext({
    agencyId: check.agency_id,
    caseId: check.case_id,
    supabase: appUser.supabase,
  });
  const sourceUrl =
    check.source_url ??
    buildCheckSourceUrl(check.check_type, {
      clientDomain: context.clientDomain,
      clientWebsite: context.clientWebsite,
    });

  const isEmailCheck = check.check_type === "company_email_lookup";
  const isPublicWebCheck =
    check.check_type === "public_web_candidate_company" ||
    check.check_type === "public_web_candidate_role_company";

  if (!sourceUrl && !isPublicWebCheck && !isEmailCheck) {
    const { error } = await appUser.supabase
      .from("case_checks")
      .update({
        completed_at: new Date().toISOString(),
        error_text: "No client website or domain available for automated research.",
        result_json: {
          errorCode: "missing_client_website",
          outcome: "missing_source",
          skippedReason: "missing_client_website",
        },
        source_url: null,
        status: "skipped",
      })
      .eq("id", check.id)
      .eq("agency_id", check.agency_id);

    if (error) {
      throw new Error(error.message);
    }

    await updateCaseResearchStatus({
      agencyId: check.agency_id,
      caseId: check.case_id,
      supabase: appUser.supabase,
    });

    return { completed: false, evidenceCreated: false, status: "skipped" as const };
  }

  await appUser.supabase
    .from("case_checks")
    .update({
      attempt_count: check.attempt_count + 1,
      error_text: null,
      started_at: new Date().toISOString(),
      status: "processing",
    })
    .eq("id", check.id)
    .eq("agency_id", check.agency_id);

  await updateCaseResearchStatus({
    agencyId: check.agency_id,
    caseId: check.case_id,
    supabase: appUser.supabase,
  });

  try {
    const ownershipWindowStatus = getOwnershipWindowStatus({
      ownershipWindowDays: context.ownershipWindowDays,
      submissionDate: context.submissionDate,
    });

    if (isEmailCheck) {
      const companyDomain = getResearchDomain(context);

      if (!companyDomain) {
        const { error } = await appUser.supabase
          .from("case_checks")
          .update({
            completed_at: new Date().toISOString(),
            error_text: "No client website or domain available for email lookup.",
            result_json: {
              errorCode: "missing_client_website",
              outcome: "missing_source",
              skippedReason: "missing_client_website",
            },
            source_url: null,
            status: "skipped",
          })
          .eq("id", check.id)
          .eq("agency_id", check.agency_id);

        if (error) {
          throw new Error(error.message);
        }

        await updateCaseResearchStatus({
          agencyId: check.agency_id,
          caseId: check.case_id,
          supabase: appUser.supabase,
        });

        return { completed: false, evidenceCreated: false, status: "skipped" as const };
      }

      if (!context.candidateFirstName || !context.candidateLastName) {
        const { error } = await appUser.supabase
          .from("case_checks")
          .update({
            completed_at: new Date().toISOString(),
            error_text: "Candidate name is not specific enough for email lookup.",
            result_json: {
              errorCode: "missing_candidate_name",
              outcome: "missing_source",
              skippedReason: "missing_candidate_name",
            },
            source_url: ensureAbsoluteUrl(context.clientWebsite) ?? `https://${companyDomain}`,
            status: "skipped",
          })
          .eq("id", check.id)
          .eq("agency_id", check.agency_id);

        if (error) {
          throw new Error(error.message);
        }

        await updateCaseResearchStatus({
          agencyId: check.agency_id,
          caseId: check.case_id,
          supabase: appUser.supabase,
        });

        return { completed: false, evidenceCreated: false, status: "skipped" as const };
      }

      const result = await findAndVerifyBusinessEmail({
        companyDomain,
        firstName: context.candidateFirstName,
        fullName: context.candidateFullName,
        lastName: context.candidateLastName,
      });
      const adjustedStrength =
        ownershipWindowStatus === "outside_window"
          ? downgradeStrength(getEmailSignalStrength({
              finderConfidence: result.confidence,
              verificationResult: result.verificationResult,
              verificationScore: result.verificationScore,
            }) ?? "weak")
          : getEmailSignalStrength({
              finderConfidence: result.confidence,
              verificationResult: result.verificationResult,
              verificationScore: result.verificationScore,
            });
      let evidenceCreated = false;

      if (adjustedStrength) {
        const rule = getScoreRule("email_signal", adjustedStrength);
        const sourceUrlForEvidence =
          ensureAbsoluteUrl(context.clientWebsite) ?? `https://${companyDomain}`;
        const summaryBase =
          result.verificationResult?.toLowerCase() === "deliverable"
            ? `Automated email lookup found a deliverable company email for ${context.candidateFullName} at ${companyDomain}.`
            : `Automated email lookup found a possible company email for ${context.candidateFullName} at ${companyDomain}.`;
        const { data: insertedEvidence, error: evidenceError } = await appUser.supabase
          .from("case_evidence")
          .insert({
            agency_id: check.agency_id,
            case_id: check.case_id,
            created_by_user_id: appUser.user.id,
            evidence_type: "email_signal",
            score_delta: rule.delta,
            snippet_text: result.email,
            source_domain: companyDomain,
            source_url: sourceUrlForEvidence,
            strength: adjustedStrength,
            summary_text:
              ownershipWindowStatus === "outside_window"
                ? `${summaryBase} The introduction appears outside the ownership window, so the signal was downgraded.`
                : summaryBase,
          })
          .select("id")
          .single();

        if (evidenceError || !insertedEvidence) {
          throw new Error(evidenceError?.message ?? "Unable to save email signal evidence");
        }

        const { error: scoreEventError } = await appUser.supabase.from("case_score_events").insert({
          agency_id: check.agency_id,
          case_id: check.case_id,
          delta: rule.delta,
          evidence_item_id: insertedEvidence.id,
          explanation:
            "Automated email lookup found a deliverable company-domain email signal for the candidate.",
          rule_key: `automated_${check.check_type}_${adjustedStrength}`,
        });

        if (scoreEventError) {
          throw new Error(scoreEventError.message);
        }

        const recalculated = await recalculateCaseScore({
          agencyId: check.agency_id,
          caseId: check.case_id,
          supabase: appUser.supabase,
        });

        await logAuditEvent({
          action: "created",
          appUser,
          entityType: "case_evidence",
          metadata: {
            automated: true,
            caseId: check.case_id,
            checkId: check.id,
            email: result.email,
            finderConfidence: result.confidence,
            scoreBand: recalculated.scoreBand,
            scoreDelta: rule.delta,
            strength: adjustedStrength,
            verificationResult: result.verificationResult,
            verificationScore: result.verificationScore,
          },
        });

        evidenceCreated = true;
      }

      const { error: updateError } = await appUser.supabase
        .from("case_checks")
        .update({
          completed_at: new Date().toISOString(),
          error_text: null,
          result_json: {
            acceptAll: result.acceptAll,
            email: result.email,
            finderConfidence: result.confidence,
            outcome: adjustedStrength ? "matched" : "no_match_found",
            ownershipWindowStatus,
            pattern: result.pattern,
            position: result.finderPosition,
            strength: adjustedStrength,
            verificationResult: result.verificationResult,
            verificationScore: result.verificationScore,
          },
          source_url: ensureAbsoluteUrl(context.clientWebsite) ?? `https://${companyDomain}`,
          status: "completed",
        })
        .eq("id", check.id)
        .eq("agency_id", check.agency_id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await updateCaseResearchStatus({
        agencyId: check.agency_id,
        caseId: check.case_id,
        supabase: appUser.supabase,
      });

      return {
        completed: true,
        evidenceCreated,
        status: "completed" as const,
      };
    }

    if (isPublicWebCheck) {
      const publicWebCheckType = check.check_type as PublicWebCheckType;
      const result = await runPublicWebSearch({
        candidateFullName: context.candidateFullName,
        candidateNameNormalized: context.candidateNameNormalized,
        checkType: publicWebCheckType,
        clientCompanyRaw: context.clientCompanyRaw,
        clientDomain: context.clientDomain,
        introducedRoleRaw: context.introducedRoleRaw,
      });

      let evidenceCreated = false;
      const adjustedStrength =
        ownershipWindowStatus === "outside_window" && result.strength
          ? downgradeStrength(result.strength)
          : result.strength;
      const isDuplicateSource =
        result.url
          ? await hasExistingEvidenceSource({
              agencyId: check.agency_id,
              caseId: check.case_id,
              sourceUrl: result.url,
              supabase: appUser.supabase,
            })
          : false;

      if (adjustedStrength && result.url && !isDuplicateSource) {
        const rule = getScoreRule("public_web", adjustedStrength);
        const { data: insertedEvidence, error: evidenceError } = await appUser.supabase
          .from("case_evidence")
          .insert({
            agency_id: check.agency_id,
            case_id: check.case_id,
            created_by_user_id: appUser.user.id,
            evidence_type: "public_web",
            score_delta: rule.delta,
            snippet_text: result.snippet,
            source_domain: getDomainFromUrl(result.url),
            source_url: result.url,
            strength: adjustedStrength,
            summary_text:
              ownershipWindowStatus === "outside_window"
                ? `Automated public-web research matched ${context.candidateFullName} against ${context.clientCompanyRaw}, but the introduction appears outside the ownership window.`
                : `Automated public-web research matched ${context.candidateFullName} against ${context.clientCompanyRaw}.`,
          })
          .select("id")
          .single();

        if (evidenceError || !insertedEvidence) {
          throw new Error(evidenceError?.message ?? "Unable to save public web evidence");
        }

        const { error: scoreEventError } = await appUser.supabase.from("case_score_events").insert({
          agency_id: check.agency_id,
          case_id: check.case_id,
          delta: rule.delta,
          evidence_item_id: insertedEvidence.id,
          explanation: `Automated public-web research found a candidate and client match in search results.`,
          rule_key: `automated_${check.check_type}_${result.strength}`,
        });

        if (scoreEventError) {
          throw new Error(scoreEventError.message);
        }

        const recalculated = await recalculateCaseScore({
          agencyId: check.agency_id,
          caseId: check.case_id,
          supabase: appUser.supabase,
        });

        await logAuditEvent({
          action: "created",
          appUser,
          entityType: "case_evidence",
          metadata: {
            automated: true,
            caseId: check.case_id,
            checkId: check.id,
            query: result.query,
            scoreBand: recalculated.scoreBand,
            scoreDelta: rule.delta,
            sourceUrl: result.url,
            strength: adjustedStrength,
          },
        });

        evidenceCreated = true;
      }

      const { error: updateError } = await appUser.supabase
        .from("case_checks")
        .update({
          completed_at: new Date().toISOString(),
          error_text: null,
          result_json: {
            dedupedAgainstExistingSource: isDuplicateSource,
            outcome: adjustedStrength ? "matched" : "no_match_found",
            ownershipWindowStatus,
            query: result.query,
            snippet: result.snippet,
            title: result.title,
            url: result.url,
            strength: adjustedStrength,
          },
          source_url: result.url || null,
          status: "completed",
        })
        .eq("id", check.id)
        .eq("agency_id", check.agency_id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await updateCaseResearchStatus({
        agencyId: check.agency_id,
        caseId: check.case_id,
        supabase: appUser.supabase,
      });

      return {
        completed: true,
        evidenceCreated,
        status: "completed" as const,
      };
    }

    const pageText = await fetchPageText(sourceUrl!);
    const analysis = analyzeCompanyPage({
      candidateFullName: context.candidateFullName,
      checkType: check.check_type,
      clientCompanyRaw: context.clientCompanyRaw,
      introducedRoleRaw: context.introducedRoleRaw,
      pageText,
    });

    let evidenceCreated = false;
    const adjustedStrength =
      ownershipWindowStatus === "outside_window" && analysis.strength
        ? downgradeStrength(analysis.strength)
        : analysis.strength;
    const isDuplicateSource = sourceUrl
      ? await hasExistingEvidenceSource({
          agencyId: check.agency_id,
          caseId: check.case_id,
          sourceUrl,
          supabase: appUser.supabase,
        })
      : false;

    if (analysis.candidateFound && adjustedStrength && !isDuplicateSource) {
      const rule = getScoreRule("company_site", adjustedStrength);
      const { data: insertedEvidence, error: evidenceError } = await appUser.supabase
        .from("case_evidence")
        .insert({
          agency_id: check.agency_id,
          case_id: check.case_id,
          created_by_user_id: appUser.user.id,
          evidence_type: "company_site",
          score_delta: rule.delta,
          snippet_text: analysis.snippet,
          source_domain: context.clientDomain,
          source_url: sourceUrl,
          strength: adjustedStrength,
          summary_text:
            ownershipWindowStatus === "outside_window"
              ? `Automated company-site research found ${context.candidateFullName}, but the introduction appears outside the ownership window.`
              : analysis.roleFound
                ? `Automated research found ${context.candidateFullName} and the introduced role on the client website.`
                : `Automated research found ${context.candidateFullName} on the client website.`,
        })
        .select("id")
        .single();

      if (evidenceError || !insertedEvidence) {
        throw new Error(evidenceError?.message ?? "Unable to save automated evidence");
      }

      const { error: scoreEventError } = await appUser.supabase.from("case_score_events").insert({
        agency_id: check.agency_id,
        case_id: check.case_id,
        delta: rule.delta,
        evidence_item_id: insertedEvidence.id,
        explanation: `Automated company-site research matched the candidate${analysis.roleFound ? " and introduced role" : ""}.`,
        rule_key: `automated_${check.check_type}_${analysis.strength}`,
      });

      if (scoreEventError) {
        throw new Error(scoreEventError.message);
      }

      const recalculated = await recalculateCaseScore({
        agencyId: check.agency_id,
        caseId: check.case_id,
        supabase: appUser.supabase,
      });

      await logAuditEvent({
        action: "created",
        appUser,
        entityType: "case_evidence",
        metadata: {
          automated: true,
          caseId: check.case_id,
          checkId: check.id,
          scoreBand: recalculated.scoreBand,
          scoreDelta: rule.delta,
          sourceUrl,
          strength: adjustedStrength,
        },
      });

      evidenceCreated = true;
    }

    const { error: updateError } = await appUser.supabase
      .from("case_checks")
      .update({
        completed_at: new Date().toISOString(),
        error_text: null,
        result_json: {
          candidateFound: analysis.candidateFound,
          companyFound: analysis.companyFound,
          dedupedAgainstExistingSource: isDuplicateSource,
          outcome: adjustedStrength ? "matched" : "no_match_found",
          ownershipWindowStatus,
          roleFound: analysis.roleFound,
          snippet: analysis.snippet,
          strength: adjustedStrength,
        },
        source_url: sourceUrl,
        status: "completed",
      })
      .eq("id", check.id)
      .eq("agency_id", check.agency_id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await updateCaseResearchStatus({
      agencyId: check.agency_id,
      caseId: check.case_id,
      supabase: appUser.supabase,
    });

    return {
      completed: true,
      evidenceCreated,
      status: "completed" as const,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const errorCode = categorizeResearchError(error);
    const { error: updateError } = await appUser.supabase
      .from("case_checks")
      .update({
        completed_at: new Date().toISOString(),
        error_text: errorMessage,
        result_json: {
          errorCode,
          outcome: "error",
        },
        source_url: sourceUrl,
        status: "failed",
      })
      .eq("id", check.id)
      .eq("agency_id", check.agency_id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await updateCaseResearchStatus({
      agencyId: check.agency_id,
      caseId: check.case_id,
      supabase: appUser.supabase,
    });

    return {
      completed: false,
      evidenceCreated: false,
      status: "failed" as const,
    };
  }
}

function getDomainFromUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getResearchDomain(context: CaseResearchContext) {
  return (
    context.clientDomain ??
    getDomainFromUrl(context.clientWebsite) ??
    null
  );
}

function getEmailSignalStrength(args: {
  finderConfidence: number | null;
  verificationResult: string | null;
  verificationScore: number | null;
}) {
  const verification = args.verificationResult?.toLowerCase() ?? "";

  if (verification !== "deliverable") {
    return null;
  }

  if ((args.finderConfidence ?? 0) >= 90 && (args.verificationScore ?? 0) >= 90) {
    return "medium" as const;
  }

  if ((args.finderConfidence ?? 0) >= 75 || (args.verificationScore ?? 0) >= 80) {
    return "weak" as const;
  }

  return null;
}

export async function processPendingCaseChecks({
  appUser,
  caseId,
  limit = 10,
  triggerSource = caseId ? "case_manual" : "manual",
}: ProcessPendingCaseChecksArgs) {
  const runId = await createResearchRun({
    appUser,
    caseId,
    triggerSource,
  });
  const query = appUser.supabase
    .from("case_checks")
    .select(
      "id, agency_id, case_id, check_type, status, attempt_count, source_url, result_json, error_text, started_at, completed_at",
    )
    .eq("agency_id", appUser.agency!.agencyId)
    .in("status", ["pending", "failed"])
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  const scopedQuery = caseId ? query.eq("case_id", caseId) : query;
  const { data, error } = await scopedQuery;

  if (error) {
    await finalizeResearchRun({
      appUser,
      errorText: error.message,
      runId,
      status: "failed",
      summary: {
        completed: 0,
        evidenceCreated: 0,
        failed: 0,
        processed: 0,
        skipped: 0,
      },
    });
    throw new Error(error.message);
  }

  const checks = (data as CaseCheckRecord[] | null) ?? [];
  const summary: ResearchRunSummary = {
    completed: 0,
    evidenceCreated: 0,
    failed: 0,
    processed: 0,
    skipped: 0,
  };

  try {
    for (const check of checks) {
      const result = await processSingleCaseCheck({ appUser, check });
      summary.processed += 1;

      if (result.status === "completed") {
        summary.completed += 1;
      }

      if (result.status === "failed") {
        summary.failed += 1;
      }

      if (result.status === "skipped") {
        summary.skipped += 1;
      }

      if (result.evidenceCreated) {
        summary.evidenceCreated += 1;
      }
    }

    await finalizeResearchRun({
      appUser,
      runId,
      status: "completed",
      summary,
    });

    return summary;
  } catch (error) {
    await finalizeResearchRun({
      appUser,
      errorText: error instanceof Error ? error.message : "Research run failed",
      runId,
      status: "failed",
      summary,
    });
    throw error;
  }
}

export async function backfillResearchChecksForAgency(args: {
  appUser: AppUserContext;
  limit?: number;
}) {
  const { data, error } = await args.appUser.supabase
    .from("cases")
    .select(
      "id, research_status, candidate_introductions!cases_candidate_introduction_id_fkey(client_domain, client_website)",
    )
    .eq("agency_id", args.appUser.agency!.agencyId)
    .eq("research_status", "not_started")
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 25);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of ((data as
    | {
        candidate_introductions:
          | {
              client_domain: string | null;
              client_website: string | null;
            }
          | {
              client_domain: string | null;
              client_website: string | null;
            }[]
          | null;
        id: string;
      }[]
    | null) ?? [])) {
    const introductionJoin = Array.isArray(row.candidate_introductions)
      ? row.candidate_introductions[0] ?? null
      : row.candidate_introductions;

    await enqueueCaseResearchChecks({
      agencyId: args.appUser.agency!.agencyId,
      caseId: row.id,
      clientDomain: introductionJoin?.client_domain ?? null,
      clientWebsite: introductionJoin?.client_website ?? null,
      supabase: args.appUser.supabase,
    });
  }
}

export async function retryCaseChecks(args: {
  appUser: AppUserContext;
  caseId?: string;
  checkId?: string;
  checkIds?: string[];
}) {
  let query = args.appUser.supabase
    .from("case_checks")
    .update({
      completed_at: null,
      error_text: null,
      result_json: {},
      started_at: null,
      status: "pending",
    })
    .eq("agency_id", args.appUser.agency!.agencyId)
    .lt("attempt_count", MAX_RESEARCH_CHECK_ATTEMPTS);

  if (args.checkIds?.length) {
    query = query.in("id", args.checkIds);
  } else if (args.checkId) {
    query = query.eq("id", args.checkId);
  } else if (args.caseId) {
    query = query.eq("case_id", args.caseId).eq("status", "failed");
  } else {
    throw new Error("Either caseId or checkId is required for retry");
  }

  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }
}
