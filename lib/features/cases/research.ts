import type { AppUserContext } from "@/lib/features/auth/server";
import { searchWebWithBrave } from "@/lib/brave/search";
import { logAuditEvent } from "@/lib/features/audit/server";
import {
  clampScore,
  getScoreBand,
  getScoreRule,
  type CaseEvidenceStrength,
} from "@/lib/features/cases/scoring";

export const CASE_CHECK_TYPES = [
  "company_site_homepage",
  "company_site_about",
  "company_site_team",
  "public_web_candidate_company",
  "public_web_candidate_role_company",
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

export type CaseCheckType = (typeof CASE_CHECK_TYPES)[number];
export type CaseCheckStatus = (typeof CASE_CHECK_STATUSES)[number];
export type CaseResearchStatus = (typeof CASE_RESEARCH_STATUSES)[number];
type PublicWebCheckType = Extract<
  CaseCheckType,
  "public_web_candidate_company" | "public_web_candidate_role_company"
>;

export const caseCheckTypeLabels: Record<CaseCheckType, string> = {
  company_site_about: "Company Site About Page",
  company_site_homepage: "Company Site Homepage",
  company_site_team: "Company Site Team Page",
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

type ResearchSourceInput = {
  clientDomain: string | null;
  clientWebsite: string | null;
};

type PublicWebSearchResult = {
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

type CaseResearchContext = {
  candidateFullName: string;
  clientCompanyRaw: string;
  clientDomain: string | null;
  clientWebsite: string | null;
  introducedRoleRaw: string;
};

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
  })).filter((check) => Boolean(check.source_url));

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
      "candidate_introductions!cases_candidate_introduction_id_fkey(candidate_full_name, client_company_raw, client_domain, client_website, introduced_role_raw)",
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
                client_company_raw: string;
                client_domain: string | null;
                client_website: string | null;
                introduced_role_raw: string;
              }
            | {
                candidate_full_name: string;
                client_company_raw: string;
                client_domain: string | null;
                client_website: string | null;
                introduced_role_raw: string;
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
    clientCompanyRaw: introduction.client_company_raw,
    clientDomain: introduction.client_domain,
    clientWebsite: introduction.client_website,
    introducedRoleRaw: introduction.introduced_role_raw,
  };
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

function buildPublicWebQuery(args: {
  candidateFullName: string;
  checkType: CaseCheckType;
  clientCompanyRaw: string;
  clientDomain: string | null;
  introducedRoleRaw: string;
}) {
  if (args.checkType === "public_web_candidate_role_company") {
    return `"${args.candidateFullName}" "${args.introducedRoleRaw}" "${args.clientCompanyRaw}"`;
  }

  if (args.clientDomain) {
    return `"${args.candidateFullName}" "${args.clientCompanyRaw}" OR site:${args.clientDomain}`;
  }

  return `"${args.candidateFullName}" "${args.clientCompanyRaw}"`;
}

function analyzePublicWebHit(args: {
  candidateFullName: string;
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
  const candidateFound = normalizedCombined.includes(
    normalizeSearchText(args.candidateFullName),
  );
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

  if (candidateFound && roleFound && (companyFound || domainFound)) {
    strength = "medium";
  } else if (candidateFound && (companyFound || domainFound)) {
    strength = "weak";
  }

  return {
    candidateFound,
    companyFound,
    domainFound,
    roleFound,
    strength,
  };
}

async function runPublicWebSearch(args: {
  candidateFullName: string;
  checkType: PublicWebCheckType;
  clientCompanyRaw: string;
  clientDomain: string | null;
  introducedRoleRaw: string;
}) {
  const query = buildPublicWebQuery(args);
  const hits = await searchWebWithBrave({
    count: 5,
    query,
  });

  for (const hit of hits) {
    const analysis = analyzePublicWebHit({
      candidateFullName: args.candidateFullName,
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

  return {
    query,
    snippet: hits[0]?.snippet ?? null,
    strength: null,
    title: hits[0]?.title ?? "No strong public-web match found",
    url: hits[0]?.url ?? "",
  } satisfies PublicWebSearchResult;
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
    .select("score_delta")
    .eq("agency_id", args.agencyId)
    .eq("case_id", args.caseId);

  if (aggregateError) {
    throw new Error(aggregateError.message);
  }

  const currentScore = clampScore(
    (((evidenceRows as { score_delta: number }[] | null) ?? []).reduce(
      (total, row) => total + row.score_delta,
      0,
    )),
  );
  const scoreBand = getScoreBand(currentScore);
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

  const isPublicWebCheck =
    check.check_type === "public_web_candidate_company" ||
    check.check_type === "public_web_candidate_role_company";

  if (!sourceUrl && !isPublicWebCheck) {
    const { error } = await appUser.supabase
      .from("case_checks")
      .update({
        completed_at: new Date().toISOString(),
        error_text: "No client website or domain available for automated research.",
        result_json: {
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
    if (isPublicWebCheck) {
      const publicWebCheckType = check.check_type as PublicWebCheckType;
      const result = await runPublicWebSearch({
        candidateFullName: context.candidateFullName,
        checkType: publicWebCheckType,
        clientCompanyRaw: context.clientCompanyRaw,
        clientDomain: context.clientDomain,
        introducedRoleRaw: context.introducedRoleRaw,
      });

      let evidenceCreated = false;

      if (result.strength && result.url) {
        const rule = getScoreRule("public_web", result.strength);
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
            strength: result.strength,
            summary_text: `Automated public-web research matched ${context.candidateFullName} against ${context.clientCompanyRaw}.`,
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
            strength: result.strength,
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
            query: result.query,
            snippet: result.snippet,
            title: result.title,
            url: result.url,
            strength: result.strength,
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

    if (analysis.candidateFound && analysis.strength) {
      const rule = getScoreRule("company_site", analysis.strength);
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
          strength: analysis.strength,
          summary_text: analysis.roleFound
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
          strength: analysis.strength,
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
          roleFound: analysis.roleFound,
          snippet: analysis.snippet,
          strength: analysis.strength,
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
    const { error: updateError } = await appUser.supabase
      .from("case_checks")
      .update({
        completed_at: new Date().toISOString(),
        error_text: error instanceof Error ? error.message : "Automated research failed",
        result_json: {},
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

export async function processPendingCaseChecks({
  appUser,
  caseId,
  limit = 10,
}: ProcessPendingCaseChecksArgs) {
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
    throw new Error(error.message);
  }

  const checks = (data as CaseCheckRecord[] | null) ?? [];
  const summary = {
    completed: 0,
    evidenceCreated: 0,
    failed: 0,
    processed: 0,
    skipped: 0,
  };

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

  return summary;
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
