import type { Lead } from "../types";

export type ScoringInput = {
  emailVerified: boolean;
  emailVerifyStatus: string;
  foundEmail: string | null;
  researchSummary?: string;
  teamPageText?: string;
  homepageText?: string;
  jobTitle?: string;
  role?: Lead["role"];
  industry?: string;
  company?: string;
  city?: string;
};

export function determineLeadRole(jobTitle: string): Lead["role"] {
  const title = jobTitle.toLowerCase();
  if (/founder|ceo|president|owner|managing partner|co-founder|chief|principal|executive/i.test(title)) {
    return "Executive";
  }
  if (/director|head of|vp|vice president|general manager/i.test(title)) {
    return "Director";
  }
  if (/manager|lead|supervisor|coordinator|strategist/i.test(title)) {
    return "Manager";
  }
  return "Individual Contributor";
}

export function determineLeadFunction(jobTitle: string, industry?: string): string {
  const title = (jobTitle || "").toLowerCase();
  if (/growth|demand|marketing|brand|seo|content|media|advertising/i.test(title)) {
    return "Marketing & Growth";
  }
  if (/sales|revenue|revops|account|sdr|bdr|commercial|business development/i.test(title)) {
    return "Sales & Revenue";
  }
  if (/founder|ceo|managing partner|owner|president|co-founder|principal|executive/i.test(title)) {
    return "Executive Leadership";
  }
  if (/partnership|alliances|channel|ecosystem/i.test(title)) {
    return "Partnerships & Alliances";
  }
  if (/operations|ops|logistics|supply chain|practice manager/i.test(title)) {
    return "Operations";
  }
  if (/engineering|product|cto|cpo|developer|tech|software|architect/i.test(title)) {
    return "Engineering & Product";
  }
  if (/talent|recruit|people|hr|human resources/i.test(title)) {
    return "HR & Recruiting";
  }

  const ind = (industry || "").toLowerCase();
  if (/marketing|agency/i.test(ind)) return "Marketing & Growth";
  if (/tech|software|saas/i.test(ind)) return "Sales & Revenue";
  return "Executive Leadership";
}

export function cleanJobTitle(title: string): string {
  const cleaned = title.replace(/["'\[\]\(\)\{\}]/g, " ").replace(/\s+/g, " ").trim();
  const knownTitles: Array<[RegExp, string]> = [
    [/founder & ceo|co-founder & ceo/i, "Founder & CEO"],
    [/co-founder/i, "Co-Founder"],
    [/founder/i, "Founder"],
    [/chief executive officer|ceo/i, "Chief Executive Officer"],
    [/managing director/i, "Managing Director"],
    [/managing partner/i, "Managing Partner"],
    [/vice president|vp/i, "VP of Operations"],
    [/head of growth/i, "Head of Growth"],
    [/head of marketing|marketing director/i, "Marketing Director"],
    [/head of sales|sales director/i, "Director of Sales"],
    [/practice principal|principal/i, "Principal"],
    [/executive director/i, "Executive Director"],
    [/general manager/i, "General Manager"],
    [/director/i, "Director"],
  ];

  for (const [pattern, canonical] of knownTitles) {
    if (pattern.test(cleaned)) {
      return canonical;
    }
  }

  return cleaned.slice(0, 40) || "Director";
}

export function cleanContactName(name: string, companyName: string): string {
  const cleaned = name.replace(/["'\[\]\(\)\{\}]/g, "").replace(/\s+/g, " ").trim();
  if (
    cleaned.length < 3 ||
    cleaned.split(" ").length > 3 ||
    /welcome|about|contact|terms|privacy|policy|trusted|services|london|dubai/i.test(cleaned)
  ) {
    return `${companyName} Leadership`;
  }
  return cleaned;
}

export function isPlaceholderEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return (
    lower.startsWith("you@") ||
    lower.startsWith("yourname@") ||
    lower.startsWith("user@") ||
    lower.startsWith("test@") ||
    lower.startsWith("demo@") ||
    lower.includes("example.com") ||
    lower.includes("sentry") ||
    lower.includes("wixpress")
  );
}

export function determineVerificationTag(
  emailVerified: boolean,
  emailVerifyStatus: string,
  hasDomainConfirmed: boolean,
): Lead["verificationTag"] {
  if (emailVerified && (emailVerifyStatus === "valid" || emailVerifyStatus === "verified")) {
    return "Email verified";
  }
  if (hasDomainConfirmed || emailVerifyStatus === "catch-all" || emailVerifyStatus === "enriched") {
    return "Enriched";
  }
  return "Review contact";
}

export function generateMatchReason(
  leadName: string,
  jobTitle: string,
  company: string,
  industry: string,
  city: string,
  campaignPrompt?: string,
): string {
  const role = determineLeadRole(jobTitle);
  const firstName = leadName.split(" ")[0];

  if (role === "Executive") {
    return `${firstName} is a primary decision-maker at ${company}, actively scaling ${industry} operations in ${city}.`;
  }
  if (role === "Director") {
    return `Leads ${jobTitle.toLowerCase()} initiatives at ${company} with immediate relevance to outbound expansion.`;
  }
  if (role === "Manager") {
    return `Directly oversees key ${industry} workflows at ${company} with strong alignment for new solutions.`;
  }
  return `Verified contact at ${company} matching ICP criteria for ${industry} in ${city}.`;
}

export function scoreCompany(input: ScoringInput): number {
  let score = 70;

  if (input.emailVerified && (input.emailVerifyStatus === "valid" || input.emailVerifyStatus === "verified")) {
    score += 15;
  } else if (input.foundEmail && !isPlaceholderEmail(input.foundEmail)) {
    score += 8;
  }

  if (input.researchSummary && input.researchSummary.length > 25) {
    score += 8;
  }

  if (input.role === "Executive") {
    score += 6;
  } else if (input.role === "Director") {
    score += 4;
  } else if (input.role === "Manager") {
    score += 2;
  }

  if (input.teamPageText && input.teamPageText.length > 150) {
    score += 5;
  } else if (input.homepageText && input.homepageText.length > 150) {
    score += 3;
  }

  return Math.min(Math.max(score, 75), 99);
}