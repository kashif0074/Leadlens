export type Lead = {
  id: string;
  name: string;
  jobTitle: string;
  role: 'Executive' | 'Director' | 'Manager' | 'Individual Contributor';
  company: string;
  industry: string;
  companySize: string;
  country: string;
  state: string;
  city: string;
  location: string;
  email: string;
  domain?: string;
  verificationTag: 'Email verified' | 'Enriched' | 'Review contact';
  matchReason: string;
  matchScore: number;
  status?: 'Discovered' | 'Contacted' | 'Replied' | 'Meeting Booked';
};

export type Campaign = {
  id: string;
  name: string;
  brief: string;
  status: 'Draft saved' | 'Live' | 'Ready';
  leadsCount: number;
  sentCount: number;
  replyRate: number;
  sequence: {
    step: number;
    delayDays: number;
    subject: string;
    body: string;
  }[];
};

export type EmailThread = {
  id: string;
  leadName: string;
  leadTitle: string;
  company: string;
  email: string;
  subject: string;
  category: 'Interested' | 'Needs Info' | 'Not Interested';
  timestamp: string;
  preview: string;
  messages: {
    sender: 'user' | 'lead';
    senderName: string;
    time: string;
    content: string;
  }[];
};

export type Meeting = {
  id: string;
  leadName: string;
  company: string;
  jobTitle: string;
  date: string;
  time: string;
  status: 'Confirmed' | 'Pending';
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

export type ViewMode = "landing" | "prompt" | "auth" | "app";

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
