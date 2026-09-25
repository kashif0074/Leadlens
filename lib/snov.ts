const SNOV_BASE_URL = "https://api.snov.io/v1";

let cachedToken: { token: string; expiresAt: number } | null = null;

// Directory/aggregator sites — inki actual company email nahi hoti, skip karo
const AGGREGATOR_DOMAINS = [
  "bbb.org",
  "leadiq.com",
  "tracxn.com",
  "maps.apple.com",
  "maps.google.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "yelp.com",
  "zoominfo.com",
  "crunchbase.com",
  "yellowpages.com",
];

function isAggregatorDomain(domain: string) {
  return AGGREGATOR_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.SNOV_CLIENT_ID?.trim();
  const clientSecret = process.env.SNOV_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 4000 → 10000

    const res = await fetch(`${SNOV_BASE_URL}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[Snov.io] Auth returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (!data.access_token) return null;

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ? data.expires_in * 1000 : 3500 * 1000) - 5 * 60 * 1000,
    };

    return cachedToken.token;
  } catch (err) {
    console.warn("[Snov.io] Failed to obtain access token:", err);
    return null;
  }
}

export type SnovEmailResult = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  status: string | null; // e.g. "valid", "catch_all", "not_verified"
  confidence?: number;
};

/**
 * Searches professional contacts and emails for a company domain.
 */
export async function findEmailsByDomain(domain: string): Promise<SnovEmailResult[]> {
  const cleanDomain = domain.replace(/^www\./i, "").trim().toLowerCase();
  if (!cleanDomain || cleanDomain.includes(" ")) return [];

  // Directory/aggregator domains ke liye API call hi mat karo
  if (isAggregatorDomain(cleanDomain)) {
    console.warn(`[Snov.io] Skipping aggregator domain: ${cleanDomain}`);
    return [];
  }

  try {
    const token = await getAccessToken();
    if (!token) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 5000 → 10000

    const res = await fetch(`${SNOV_BASE_URL}/get-domain-emails-with-info`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
      body: new URLSearchParams({
        access_token: token,
        domain: cleanDomain,
        type: "all",
        limit: "15",
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[Snov.io] Domain lookup returned HTTP ${res.status} for ${cleanDomain}`);
      return [];
    }

    const data = await res.json();
    const emails = data?.emails || [];

    return emails.map((e: any) => ({
      email: e.email || null,
      firstName: e.firstName || null,
      lastName: e.lastName || null,
      position: e.position || null,
      status: e.emailStatus || (e.status === "valid" ? "valid" : "not_verified"),
      confidence: typeof e.confidence === "number" ? e.confidence : 85,
    }));
  } catch (err) {
    console.warn(`[Snov.io] Error looking up domain ${cleanDomain}:`, err);
    return [];
  }
}

/**
 * Selects the optimal business lead from discovered email results.
 * Prioritizes high-level decision makers with verified email status.
 */
export function pickBestEmail(results: SnovEmailResult[]): SnovEmailResult | null {
  if (!results.length) return null;

  const validWithEmail = results.filter((r) => r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
  if (!validWithEmail.length) return null;

  const executiveKeywords = /founder|ceo|director|managing|partner|owner|president|vp|head|chief/i;

  // 1. Valid + Executive role
  const validExec = validWithEmail.find(
    (r) => (r.status === "valid" || r.status === "verified") && r.position && executiveKeywords.test(r.position),
  );
  if (validExec) return validExec;

  // 2. Any verified email
  const validAny = validWithEmail.find((r) => r.status === "valid" || r.status === "verified");
  if (validAny) return validAny;

  // 3. Any executive with catch-all or unverified email
  const anyExec = validWithEmail.find((r) => r.position && executiveKeywords.test(r.position));
  if (anyExec) return anyExec;

  // 4. First deliverable email
  return validWithEmail[0];
}