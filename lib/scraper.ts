import * as cheerio from "cheerio";

const TEAM_PAGE_KEYWORDS = [
  "team",
  "about",
  "about-us",
  "our-team",
  "leadership",
  "staff",
  "people",
  "contact",
  "contact-us",
  "meet-the-team",
  "management",
];

const FETCH_TIMEOUT_MS = 3500;

export const INVALID_DOMAIN_PATTERNS = [
  /facebook\.com/i,
  /instagram\.com/i,
  /linkedin\.com/i,
  /twitter\.com|x\.com/i,
  /youtube\.com/i,
  /yelp\./i,
  /yellowpages\./i,
  /tripadvisor\./i,
  /google\./i,
  /foursquare\./i,
  /wikipedia\.org/i,
  /zoominfo\.com/i,
  /crunchbase\.com/i,
  /glassdoor\./i,
  /npmjs\.com/i,
  /github\.com/i,
  /gov\.uk|\.gov\b/i,
  /w3\.org/i,
  /schema\.org/i,
  /wordpress\.org/i,
];

export function isInvalidDomain(domain: string): boolean {
  if (!domain || domain.length < 3) return true;
  return INVALID_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain));
}

async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeWebsiteUrl(website: string): string {
  const trimmed = website.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function extractDomainFromUrl(urlStr: string): string {
  try {
    return new URL(normalizeWebsiteUrl(urlStr)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return urlStr.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

function findRelevantPageUrl(html: string, baseUrl: string): string | null {
  try {
    const $ = cheerio.load(html);
    let bestLink: string | null = null;

    $("a[href]").each((_, el) => {
      if (bestLink) return;
      const href = $(el).attr("href") || "";
      const text = $(el).text().toLowerCase();
      const hrefLower = href.toLowerCase();

      const matches = TEAM_PAGE_KEYWORDS.some(
        (kw) => hrefLower.includes(`/${kw}`) || hrefLower.endsWith(kw) || text.includes(kw),
      );

      if (matches) {
        try {
          const parsed = new URL(href, baseUrl);
          if (parsed.hostname === new URL(baseUrl).hostname) {
            bestLink = parsed.toString();
          }
        } catch {
          // Skip invalid URL
        }
      }
    });

    return bestLink;
  } catch {
    return null;
  }
}

function extractCleanText(html: string): string {
  try {
    const $ = cheerio.load(html);
    $("script, style, nav, footer, svg, noscript, iframe, head").remove();
    return $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000);
  } catch {
    return "";
  }
}

function extractEmailsFromHtml(html: string, domain: string): string[] {
  try {
    const $ = cheerio.load(html);
    const emails = new Set<string>();

    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr("href") || "";
      const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
      if (
        email &&
        email.includes("@") &&
        !email.includes("sentry") &&
        !email.includes("example") &&
        !email.includes("wix")
      ) {
        emails.add(email);
      }
    });

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex) || [];
    for (const match of matches) {
      const em = match.toLowerCase();
      if (
        !em.endsWith(".png") &&
        !em.endsWith(".jpg") &&
        !em.endsWith(".svg") &&
        !em.includes("wixpress") &&
        !em.includes("sentry") &&
        !em.includes("schema.org")
      ) {
        emails.add(em);
      }
    }

    return Array.from(emails);
  } catch {
    return [];
  }
}

export type DiscoveredExecutive = {
  name: string;
  jobTitle: string;
  role: "Executive" | "Director" | "Manager" | "Individual Contributor";
};

function extractExecutivesFromText(text: string): DiscoveredExecutive[] {
  const executives: DiscoveredExecutive[] = [];
  const lines = text.split(/[.\n•|]/).map((l) => l.trim()).filter(Boolean);

  const titlePatterns: Array<{ regex: RegExp; role: DiscoveredExecutive["role"] }> = [
    { regex: /(founder|co-founder|chief executive officer|ceo|president|managing partner|owner|principal|managing director)/i, role: "Executive" },
    { regex: /(vice president|vp|director|head of growth|head of marketing|head of sales|head of operations)/i, role: "Director" },
    { regex: /(manager|lead|supervisor|strategist|coordinator)/i, role: "Manager" },
  ];

  for (const line of lines) {
    for (const { regex, role } of titlePatterns) {
      const match = line.match(regex);
      if (match) {
        const nameMatch = line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
        if (nameMatch && nameMatch[1].length > 3 && nameMatch[1].length < 30) {
          const candidateName = nameMatch[1].trim();
          if (!/about|contact|service|london|dubai|agency|studio|clinic|dental|welcome|digital|team|growth|terms|privacy/i.test(candidateName)) {
            if (!executives.some((e) => e.name === candidateName)) {
              executives.push({
                name: candidateName,
                jobTitle: line.slice(0, 60).trim(),
                role,
              });
            }
          }
        }
      }
    }
  }

  return executives.slice(0, 3);
}

export type ScrapedCompanyContent = {
  homepageText: string;
  teamPageUrl: string | null;
  teamPageText: string;
  discoveredEmails: string[];
  discoveredExecutives: DiscoveredExecutive[];
};

export async function scrapeCompanyWebsite(website: string): Promise<ScrapedCompanyContent> {
  const baseUrl = normalizeWebsiteUrl(website);
  const domain = extractDomainFromUrl(baseUrl);

  if (isInvalidDomain(domain)) {
    return {
      homepageText: "",
      teamPageUrl: null,
      teamPageText: "",
      discoveredEmails: [],
      discoveredExecutives: [],
    };
  }

  let homepageHtml = "";
  try {
    const res = await fetchWithTimeout(baseUrl, 3500);
    if (res && res.ok) {
      homepageHtml = await res.text();
    }
  } catch {
    homepageHtml = "";
  }

  const homepageText = extractCleanText(homepageHtml);
  const teamPageUrl = findRelevantPageUrl(homepageHtml, baseUrl);

  let teamPageHtml = "";
  if (teamPageUrl) {
    try {
      const res = await fetchWithTimeout(teamPageUrl, 2500);
      if (res && res.ok) {
        teamPageHtml = await res.text();
      }
    } catch {
      teamPageHtml = "";
    }
  }

  const teamPageText = extractCleanText(teamPageHtml);
  const combinedHtml = `${homepageHtml} ${teamPageHtml}`;
  const discoveredEmails = extractEmailsFromHtml(combinedHtml, domain);
  const discoveredExecutives = [
    ...extractExecutivesFromText(teamPageText),
    ...extractExecutivesFromText(homepageText),
  ];

  return {
    homepageText,
    teamPageUrl,
    teamPageText,
    discoveredEmails,
    discoveredExecutives,
  };
}