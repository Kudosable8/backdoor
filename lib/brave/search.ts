type BraveWebResult = {
  description?: string;
  extra_snippets?: string[];
  profile?: {
    long_name?: string;
  };
  title?: string;
  url?: string;
};

type BraveSearchResponse = {
  web?: {
    results?: BraveWebResult[];
  };
};

export type BraveSearchHit = {
  snippet: string | null;
  title: string;
  url: string;
};

export async function searchWebWithBrave(args: {
  count?: number;
  query: string;
}) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY is not configured");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", args.query);
  url.searchParams.set("count", String(args.count ?? 5));
  url.searchParams.set("text_decorations", "false");
  url.searchParams.set("search_lang", "en");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    method: "GET",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Brave search failed with HTTP ${response.status}`);
  }

  const result = (await response.json()) as BraveSearchResponse;
  const hits: BraveSearchHit[] = (result.web?.results ?? [])
    .map((item) => {
      const urlValue = item.url?.trim();

      if (!urlValue) {
        return null;
      }

      return {
        snippet:
          item.extra_snippets?.find(Boolean)?.trim() ??
          item.description?.trim() ??
          null,
        title:
          item.title?.trim() ??
          item.profile?.long_name?.trim() ??
          urlValue,
        url: urlValue,
      };
    })
    .filter((item): item is BraveSearchHit => Boolean(item));

  return hits;
}
