export type Lead = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jobTitle: string;
  role: 'Executive' | 'Director' | 'Manager' | 'Individual Contributor';
  function?: string;
  company: string;
  industry: string;
  companySize: string;
  country: string;
  state: string;
  city: string;
  location: string;
  companyHeadquarters?: string;
  email: string;
  domain?: string;
  verificationTag: 'Email verified' | 'Enriched' | 'Review contact';
  matchReason: string;
  matchScore: number;
  status?: 'Discovered' | 'Contacted' | 'Replied' | 'Meeting Booked';
  linkedinUrl?: string;
};

export type Campaign = {
  id: string;
  userId?: string | null;
  name: string;
  brief: string;
  prompt?: string;
  selectedLeadIds?: string[];
  selectedLeads?: Lead[];
  connectedEmail?: string | null;
  provider?: string | null;
  status: 'Draft saved' | 'Live' | 'Ready' | 'Partially sent' | 'Failed';
  leadsCount: number;
  sentCount: number;
  failedCount?: number;
  replyRate: number;
  personalizedEmails?: Record<string, {
    step: number;
    delayDays: number;
    subject: string;
    body: string;
    manuallyEdited?: boolean;
  }[]>;
  sequence: {
    step: number;
    delayDays: number;
    subject: string;
    body: string;
    manuallyEdited?: boolean;
  }[];
};

export type AppModule =
  | "dashboard"
  | "campaign"
  | "campaigns"
  | "lead-generation"
  | "leads"
  | "email-sequence"
  | "inbox"
  | "meetings"
  | "analytics"
  | "settings";

export type SetupStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CampaignDraft = {
  brief: string;
  selectedLeadIds: string[];
  providerConnected: boolean;
  connectedProvider: string;
  connectedEmail: string;
  sendingSaved: boolean;
  warmupComplete: boolean;
  launched: boolean;
  setupStep: SetupStep;
};
