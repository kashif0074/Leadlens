import type { Campaign, Lead } from "../types";

type StoredCampaign = {
  id: string;
  userId?: string | null;
  name: string;
  prompt: string;
  status: string;
  selectedLeadIds: unknown;
  selectedLeads: unknown;
  emails: unknown;
  personalizedEmails?: unknown;
  connectedEmail?: string | null;
  provider?: string | null;
  sentCount?: number;
  failedCount?: number;
};

function asLeadArray(value: unknown): Lead[] {
  return Array.isArray(value) ? (value as Lead[]) : [];
}

function asIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asSequence(value: unknown): Campaign["sequence"] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Campaign["sequence"][number] =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { subject?: unknown }).subject === "string" &&
      typeof (item as { body?: unknown }).body === "string",
  );
}

function asStatus(status: string): Campaign["status"] {
  if (status === "Live") return "Live";
  if (status === "Partially sent") return "Partially sent";
  if (status === "Failed") return "Failed";
  if (status === "Ready") return "Ready";
  return "Draft saved";
}

export function mapStoredCampaign(campaign: StoredCampaign): Campaign {
  const selectedLeads = asLeadArray(campaign.selectedLeads);
  const selectedLeadIds = asIdArray(campaign.selectedLeadIds);
  const ids = selectedLeadIds.length ? selectedLeadIds : selectedLeads.map((lead) => lead.id);

  return {
    id: campaign.id,
    userId: campaign.userId,
    name: campaign.name,
    brief: campaign.prompt,
    prompt: campaign.prompt,
    selectedLeadIds: ids,
    selectedLeads,
    connectedEmail: campaign.connectedEmail,
    provider: campaign.provider,
    status: asStatus(campaign.status),
    leadsCount: ids.length || selectedLeads.length,
    sentCount: campaign.sentCount ?? 0,
    failedCount: campaign.failedCount ?? 0,
    replyRate: 0,
    personalizedEmails:
      campaign.personalizedEmails && typeof campaign.personalizedEmails === "object"
        ? (campaign.personalizedEmails as Campaign["personalizedEmails"])
        : undefined,
    sequence: asSequence(campaign.emails),
  };
}

export function workspaceStorageKey(userId: string) {
  return `leadlens-workspace-context:${userId}`;
}

export function settingsStorageKey(userId: string) {
  return `leadlens-settings:${userId}`;
}

export function personalizeText(template: string, lead: Partial<Lead>): string {
  if (!template) return "";

  const firstName =
    (typeof (lead as { firstName?: string }).firstName === "string" && (lead as { firstName?: string }).firstName) ||
    lead.name?.trim().split(/\s+/)[0] ||
    "there";
  const lastName =
    (typeof (lead as { lastName?: string }).lastName === "string" && (lead as { lastName?: string }).lastName) ||
    lead.name?.trim().split(/\s+/).slice(1).join(" ") ||
    "";
  const fullName = lead.name?.trim() || firstName;
  const company = lead.company?.trim() || "your company";
  const jobTitle = lead.jobTitle?.trim() || lead.role?.trim() || "Executive";
  const role = lead.jobTitle?.trim() || lead.role?.trim() || "Executive";
  const seniority = lead.role?.trim() || jobTitle;
  const industry = lead.industry?.trim() || "your industry";
  const location = lead.location?.trim() || lead.city?.trim() || "your region";
  const city = lead.city?.trim() || (location.includes(",") ? location.split(",")[0].trim() : location);
  const country = lead.country?.trim() || (location.includes(",") ? location.split(",").slice(1).join(", ").trim() : "");
  const companySize = lead.companySize?.trim() || "";
  const matchReason = lead.matchReason?.trim() || "";
  const linkedinUrl = lead.linkedinUrl?.trim() || "";
  const email = lead.email?.trim() || "";

  let result = template
    .replace(/\{\{\s*first_?name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*last_?name\s*\}\}/gi, lastName)
    .replace(/\{\{\s*name\s*\}\}/gi, fullName)
    .replace(/\{\{\s*full_?name\s*\}\}/gi, fullName)
    .replace(/\{\{\s*company\s*\}\}/gi, company)
    .replace(/\{\{\s*company_?name\s*\}\}/gi, company)
    .replace(/\{\{\s*job_?title\s*\}\}/gi, jobTitle)
    .replace(/\{\{\s*title\s*\}\}/gi, jobTitle)
    .replace(/\{\{\s*role\s*\}\}/gi, role)
    .replace(/\{\{\s*seniority\s*\}\}/gi, seniority)
    .replace(/\{\{\s*industry\s*\}\}/gi, industry)
    .replace(/\{\{\s*sector\s*\}\}/gi, industry)
    .replace(/\{\{\s*location\s*\}\}/gi, location)
    .replace(/\{\{\s*city\s*\}\}/gi, city)
    .replace(/\{\{\s*country\s*\}\}/gi, country)
    .replace(/\{\{\s*company_?size\s*\}\}/gi, companySize)
    .replace(/\{\{\s*match_?reason\s*\}\}/gi, matchReason)
    .replace(/\{\{\s*linkedin_?(?:url|profile)?\s*\}\}/gi, linkedinUrl)
    .replace(/\{\{\s*email\s*\}\}/gi, email);

  // Clean up any remaining unresolved {{tags}}
  result = result.replace(/\{\{\s*[a-zA-Z0-9_-]+\s*\}\}/g, "");

  return result.trim();
}
