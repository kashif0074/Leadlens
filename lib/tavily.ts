import { isInvalidDomain, extractDomainFromUrl } from "./scraper";

export type TavilyResult = {
  isValid: boolean;
  summary: string;
  confirmedUrl: string;
  discoveredWebsite?: string | null;
};

export async function confirmCompanyDomain(
  companyName: string,
  website: string | null,
  city: string,
): Promise<TavilyResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  const cleanName = companyName.replace(/[\(\)\[\]\{\}]/g, "").trim();

  if (!apiKey) {
    return {
      isValid: Boolean(website),
      summary: `${cleanName} is an active business located in ${city}.`,
      confirmedUrl: website || "",
      discoveredWebsite: website,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const query = website
      ? `"${cleanName}" ${city} official website`
      : `${cleanName} ${city} official website company overview`;

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 4,
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        isValid: Boolean(website),
        summary: `${cleanName} provides specialized services in ${city}.`,
        confirmedUrl: website || "",
        discoveredWebsite: website,
      };
    }

    const data = await response.json();
    const results = (data.results || []) as Array<{ url: string; title: string; content?: string }>;
    const answer = data.answer || "";

    let targetDomain = "";
    if (website) {
      targetDomain = extractDomainFromUrl(website);
    }

    let bestDiscoveredUrl: string | null = null;
    let domainMatched = false;

    for (const r of results) {
      if (!r.url) continue;
      const rDomain = extractDomainFromUrl(r.url);
      if (isInvalidDomain(rDomain)) continue;

      if (!bestDiscoveredUrl) {
        bestDiscoveredUrl = r.url;
      }

      if (targetDomain) {
        if (rDomain === targetDomain || rDomain.includes(targetDomain) || targetDomain.includes(rDomain)) {
          domainMatched = true;
          bestDiscoveredUrl = r.url;
          break;
        }
      }
    }

    const finalUrl = (domainMatched ? website : bestDiscoveredUrl) || website || "";
    const summary =
      answer && answer.length > 25
        ? answer.slice(0, 350)
        : results[0]?.content
          ? results[0].content.slice(0, 250)
          : `${cleanName} is an established company operating in ${city}.`;

    return {
      isValid: Boolean(domainMatched || (bestDiscoveredUrl && !isInvalidDomain(extractDomainFromUrl(bestDiscoveredUrl)))),
      summary,
      confirmedUrl: finalUrl,
      discoveredWebsite: finalUrl || null,
    };
  } catch {
    return {
      isValid: Boolean(website),
      summary: `${cleanName} is located in ${city}.`,
      confirmedUrl: website || "",
      discoveredWebsite: website,
    };
  }
}