type HunterEmailFinderResponse = {
  data?: {
    accept_all?: boolean | null;
    confidence?: number | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    pattern?: string | null;
    position?: string | null;
  } | null;
  errors?: { details?: string; message?: string }[];
};

type HunterEmailVerifierResponse = {
  data?: {
    accept_all?: boolean | null;
    block?: boolean | null;
    disposable?: boolean | null;
    gibberish?: boolean | null;
    regexp?: boolean | null;
    result?: string | null;
    score?: number | null;
    smtp_check?: boolean | null;
    status?: string | null;
    webmail?: boolean | null;
  } | null;
  errors?: { details?: string; message?: string }[];
};

export type HunterEmailLookupResult = {
  acceptAll: boolean | null;
  confidence: number | null;
  email: string;
  finderPosition: string | null;
  pattern: string | null;
  verificationResult: string | null;
  verificationScore: number | null;
};

function getApiKey() {
  const apiKey = process.env.HUNTER_API_KEY;

  if (!apiKey) {
    throw new Error("HUNTER_API_KEY is not configured");
  }

  return apiKey;
}

function getHunterErrorMessage(result: {
  errors?: { details?: string; message?: string }[];
}) {
  return result.errors?.[0]?.details ?? result.errors?.[0]?.message ?? "Hunter request failed";
}

async function runHunterRequest<T>(url: URL) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    method: "GET",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Hunter API failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function findAndVerifyBusinessEmail(args: {
  companyDomain: string;
  firstName: string;
  fullName: string;
  lastName: string;
}) {
  const apiKey = getApiKey();
  const finderUrl = new URL("https://api.hunter.io/v2/email-finder");
  finderUrl.searchParams.set("domain", args.companyDomain);
  finderUrl.searchParams.set("first_name", args.firstName);
  finderUrl.searchParams.set("last_name", args.lastName);
  finderUrl.searchParams.set("full_name", args.fullName);
  finderUrl.searchParams.set("api_key", apiKey);

  const finderResult = await runHunterRequest<HunterEmailFinderResponse>(finderUrl);
  const email = finderResult.data?.email?.trim().toLowerCase();

  if (!email) {
    throw new Error(getHunterErrorMessage(finderResult));
  }

  const verifierUrl = new URL("https://api.hunter.io/v2/email-verifier");
  verifierUrl.searchParams.set("email", email);
  verifierUrl.searchParams.set("api_key", apiKey);

  const verificationResult =
    await runHunterRequest<HunterEmailVerifierResponse>(verifierUrl);

  return {
    acceptAll: verificationResult.data?.accept_all ?? finderResult.data?.accept_all ?? null,
    confidence:
      typeof finderResult.data?.confidence === "number"
        ? finderResult.data.confidence
        : null,
    email,
    finderPosition: finderResult.data?.position?.trim() ?? null,
    pattern: finderResult.data?.pattern?.trim() ?? null,
    verificationResult:
      verificationResult.data?.result?.trim() ??
      verificationResult.data?.status?.trim() ??
      null,
    verificationScore:
      typeof verificationResult.data?.score === "number"
        ? verificationResult.data.score
        : null,
  } satisfies HunterEmailLookupResult;
}
