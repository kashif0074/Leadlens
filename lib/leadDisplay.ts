import type { Lead } from "../types";
import { determineLeadFunction } from "./scoring";

export function leadDomain(lead: Lead): string {
  if (lead.domain && lead.domain.trim()) return lead.domain.trim();
  if (lead.email && lead.email.includes("@")) {
    return lead.email.split("@")[1].trim().toLowerCase();
  }
  return "";
}

export function getLeadFunction(lead: Lead): string {
  if (lead.function && lead.function.trim()) return lead.function.trim();
  return determineLeadFunction(lead.jobTitle, lead.industry);
}

export function getLeadHeadquarters(lead: Lead): string {
  if (lead.companyHeadquarters && lead.companyHeadquarters.trim()) {
    return lead.companyHeadquarters.trim();
  }
  if (lead.city && lead.country) return `${lead.city}, ${lead.country}`;
  if (lead.location) return lead.location;
  if (lead.country) return lead.country;
  return "Global";
}

export function getLeadLinkedInUrl(lead: Lead): string {
  if (lead.linkedinUrl && lead.linkedinUrl.trim()) {
    return lead.linkedinUrl.trim();
  }
  return `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(
    `${lead.name} ${lead.company}`,
  )}`;
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function cleanCompanyName(name: string): string {
  return name
    .replace(/\b(LLC|Ltd\.?|Inc\.?|GmbH|Pte\.?|Co\.?|Pty\.?|Corp\.?|Plc\.?|Limited)\b/gi, "")
    .replace(/[,\.\-\/]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
