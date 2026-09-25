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
    sentCount: 0,
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
