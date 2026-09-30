"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Mail,
  Pencil,
  X,
  Sparkles,
  FileSpreadsheet,
  Upload,
  Users,
  ShieldCheck,
  Rocket,
  Plus,
  FileText,
  BarChart3,
  Inbox,
  RotateCcw,
  Check,
  Download,
  AlertCircle,
} from "lucide-react";
import type { AppModule, Campaign, Lead, SetupStep } from "../../types";
import LeadManagementView from "../leads/LeadManagementView";
import { ConnectGmail } from "./ConnectGmail";
import { determineLeadRole, determineLeadFunction } from "../../lib/scoring";

export interface CampaignLaunchContext {
  prompt: string;
  selectedLeadIds: string[];
  selectedLeads: Lead[];
  connectedEmail: string;
  provider: string;
  allLeads?: Lead[];
}

interface CampaignsModuleProps {
  campaigns?: Campaign[];
  activeCampaignId?: string;
  launchContext?: CampaignLaunchContext | null;
  leads: Lead[];
  onOpenNewCampaign: () => void;
  onAddToConnect: () => void;
  onLaunch: (payload: { selectedLeadIds: string[]; selectedLeads: Lead[]; connectedEmail: string; provider: string }) => Promise<{ sentCount: number; failedCount: number; total: number; status: Campaign["status"] }>;
  onNavigate?: (module: AppModule) => void;
  onSelectCampaign?: (campaignId: string) => void;
  onImportCsvLeads?: (leads: Lead[]) => void;
}

const steps = ["Leads", "Connect inbox", "Send emails", "Sending", "Warmup", "Review", "Launch"];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type CampaignEmail = Campaign["sequence"][number];

function createEmailSequence(campaign?: Campaign): CampaignEmail[] {
  const saved = campaign?.sequence ?? [];
  return Array.isArray(saved) && saved.length > 0
    ? saved.map((email, index) => ({ ...email, step: index + 1 }))
    : [];
}

export const REQUIRED_CSV_FORMAT_MESSAGE =
  "Please upload a CSV file with this format: Person | Role | Company | Email | LinkedIn Profile | Industry | Location";

export const CSV_TEMPLATE_CONTENT = `Person,Role,Company,Email,LinkedIn Profile,Industry,Location
Sarah Jenkins,VP of Growth,Apex Data Solutions,sarah.jenkins@apexdata.io,https://linkedin.com/in/sarahjenkins-growth,Enterprise SaaS,"San Francisco, USA"
Michael Chen,Head of Outbound Sales,Nexus Cloud Systems,michael.chen@nexuscloud.io,https://linkedin.com/in/michaelchen-sales,Cloud Infrastructure,"Austin, USA"
Elena Rostova,Chief Technology Officer,Vanguard Dynamics,elena.rostova@vanguarddyn.com,https://linkedin.com/in/elenarostova-cto,FinTech,"London, UK"
David Martinez,Director of Revenue Operations,ScalePeak Analytics,david.martinez@scalepeak.io,https://linkedin.com/in/davidmartinez-revops,B2B Software,"New York, USA"`;

export function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "leadlens_prospects_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function validateAndParseCsv(
  file: File,
  csvContent: string,
): { valid: boolean; leads: Lead[]; errorMessage?: string } {
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".csv")) {
    return {
      valid: false,
      leads: [],
      errorMessage: REQUIRED_CSV_FORMAT_MESSAGE,
    };
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      valid: false,
      leads: [],
      errorMessage: REQUIRED_CSV_FORMAT_MESSAGE,
    };
  }

  const headerCols = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/['"]/g, "").trim(),
  );

  const findCol = (predicate: (h: string) => boolean) => headerCols.findIndex(predicate);

  const personIdx = findCol(
    (h) => h === "person" || h === "name" || h === "full name" || h === "full_name" || h === "contact" || h === "lead",
  );
  const roleIdx = findCol(
    (h) => h === "role" || h === "title" || h === "job title" || h === "job_title" || h === "position" || h === "designation",
  );
  const companyIdx = findCol(
    (h) => h === "company" || h === "organization" || h === "company name" || h === "company_name" || h === "org" || h === "business",
  );
  const emailIdx = findCol(
    (h) => h === "email" || h === "email address" || h === "email_address" || h === "mail" || h === "work email" || h === "work_email",
  );
  const linkedinIdx = findCol(
    (h) => h.includes("linkedin") || h === "profile" || h === "linkedin profile" || h === "linkedin_profile" || h === "linkedin url" || h === "linkedin_url",
  );
  const industryIdx = findCol(
    (h) => h === "industry" || h === "sector" || h === "vertical" || h === "category",
  );
  const locationIdx = findCol(
    (h) => h === "location" || h === "city" || h === "country" || h === "geo" || h === "headquarters" || h === "hq",
  );

  // Validate that all required 7 columns are present
  if (
    personIdx === -1 ||
    roleIdx === -1 ||
    companyIdx === -1 ||
    emailIdx === -1 ||
    linkedinIdx === -1 ||
    industryIdx === -1 ||
    locationIdx === -1
  ) {
    return {
      valid: false,
      leads: [],
      errorMessage: REQUIRED_CSV_FORMAT_MESSAGE,
    };
  }

  const leads: Lead[] = [];
  const now = Date.now();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]).map((c) => c.replace(/^['"]|['"]$/g, "").trim());
    if (cols.length < 2) continue;

    const name = cols[personIdx] || "";
    const jobTitle = cols[roleIdx] || "Decision Maker";
    const company = cols[companyIdx] || "Enterprise";
    const email = cols[emailIdx] || "";
    const linkedinUrl = cols[linkedinIdx] || "";
    const industry = cols[industryIdx] || "Technology & Services";
    const location = cols[locationIdx] || "Global";

    if (!name && !email) continue;

    const role = determineLeadRole(jobTitle);
    const fn = determineLeadFunction(jobTitle, industry);
    const firstName = name.split(/\s+/)[0] || name;
    const lastName = name.split(/\s+/).slice(1).join(" ");
    const city = location.includes(",") ? location.split(",")[0].trim() : location;
    const country = location.includes(",") ? location.split(",").slice(1).join(", ").trim() : location;
    const domain = email.includes("@") ? email.split("@")[1].trim().toLowerCase() : "";

    leads.push({
      id: `lead-csv-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || `Lead ${i}`,
      jobTitle,
      role,
      function: fn,
      company,
      industry,
      companySize: "50-100",
      country,
      state: "",
      city,
      location,
      companyHeadquarters: location,
      email: email || `lead${i}@example.com`,
      domain,
      verificationTag: "Email verified",
      matchReason: `Imported prospect from ${company} in ${industry} (${location}).`,
      matchScore: 95,
      status: "Discovered",
      linkedinUrl,
      importSource: "csv",
    });
  }

  if (leads.length === 0) {
    return {
      valid: false,
      leads: [],
      errorMessage: REQUIRED_CSV_FORMAT_MESSAGE,
    };
  }

  return {
    valid: true,
    leads,
  };
}

export default function CampaignsModule({
  campaigns = [],
  activeCampaignId,
  launchContext,
  leads,
  onOpenNewCampaign,
  onAddToConnect,
  onLaunch,
  onNavigate,
  onSelectCampaign,
  onImportCsvLeads,
}: CampaignsModuleProps) {
  const campaign = campaigns.find((item) => item.id === activeCampaignId) ?? campaigns[0];
  const effectiveLeads =
    leads && leads.length > 0
      ? leads
      : ((campaign?.selectedLeads as Lead[]) ?? []);

  const [step, setStep] = useState<SetupStep>(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(launchContext?.selectedLeadIds ?? campaign?.selectedLeadIds ?? []),
  );
  const [provider, setProvider] = useState(campaign?.provider ?? "");
  const [email, setEmail] = useState(campaign?.connectedEmail ?? "");
  const [sendingSaved, setSendingSaved] = useState(() => campaign?.status === "Live");
  const [warmupAcknowledged, setWarmupAcknowledged] = useState(() => campaign?.status === "Live");
  const [toast, setToast] = useState("");
  const [launchError, setLaunchError] = useState("");
  const [launchResult, setLaunchResult] = useState<{ sentCount: number; failedCount: number; total: number } | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [emailSequence, setEmailSequence] = useState<CampaignEmail[]>(() => createEmailSequence(campaign));
  const [editingEmail, setEditingEmail] = useState<number | null>(null);
  const [regenerationPrompt, setRegenerationPrompt] = useState("");
  const [pendingSequence, setPendingSequence] = useState<CampaignEmail[] | null>(null);
  const [pendingPersonalizedEmails, setPendingPersonalizedEmails] = useState<Campaign["personalizedEmails"]>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");

  // New Campaign Choice Modal & CSV Import Modal States
  const [showNewCampaignModal, setShowNewCampaignModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvRawText, setCsvRawText] = useState("");
  const [csvError, setCsvError] = useState("");
  const [csvParsedPreview, setCsvParsedPreview] = useState<Lead[]>([]);

  useEffect(() => {
    const syncContext = window.setTimeout(() => {
      if (launchContext?.selectedLeadIds?.length) {
        setSelectedIds(new Set(launchContext.selectedLeadIds));
      }
    }, 0);
    return () => window.clearTimeout(syncContext);
  }, [launchContext]);

  useEffect(() => {
    if (campaign?.sequence && Array.isArray(campaign.sequence) && campaign.sequence.length > 0) {
      const syncSequence = window.setTimeout(
        () => setEmailSequence(campaign.sequence.map((email, index) => ({ ...email, step: index + 1 }))),
        0,
      );
      return () => window.clearTimeout(syncSequence);
    }
  }, [campaign?.id, campaign?.sequence]);

  useEffect(() => {
    if (campaign?.selectedLeadIds && Array.isArray(campaign.selectedLeadIds) && (!launchContext?.selectedLeadIds || launchContext.selectedLeadIds.length === 0)) {
      setSelectedIds(new Set(campaign.selectedLeadIds as string[]));
    }
    if (campaign?.connectedEmail) {
      setEmail(campaign.connectedEmail);
    }
    if (campaign?.provider) {
      setProvider(campaign.provider);
    }
    if (campaign?.status === "Live") {
      setSendingSaved(true);
      setWarmupAcknowledged(true);
    }
  }, [campaign?.id, campaign?.selectedLeadIds, campaign?.connectedEmail, campaign?.provider, campaign?.status, launchContext]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const canReview = selectedIds.size > 0 && Boolean(email) && sendingSaved && warmupAcknowledged;
  const activeCampaignName = campaign?.name ?? "New campaign";
  const brief = launchContext?.prompt ?? campaign?.brief ?? "";
  const launched = campaign?.status === "Live" || campaign?.status === "Partially sent";
  const liveCampaigns = campaigns.filter((c) => c.status === "Live");
  const importedOnly = effectiveLeads.length > 0 && effectiveLeads.every((lead) => lead.importSource === "csv");

  const saveConnectedAccount = async (account: { id: string; email: string }) => {
    if (!campaign?.id) {
      throw new Error("Save the campaign before connecting an inbox.");
    }
    const response = await fetch("/api/campaigns/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: campaign.id,
        emailAccountId: account.id,
        email: account.email,
        provider: "Google Workspace / Gmail",
      }),
    });
    const result = (await response.json()) as { connectedEmail?: string; provider?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Unable to save this Gmail account for the campaign.");
    setEmail(result.connectedEmail ?? account.email);
    setProvider(result.provider ?? "Google Workspace / Gmail");
    notify("Gmail account verified and saved for this campaign.");
  };

  const disconnectConnectedAccount = async (accountId: string) => {
    const response = await fetch(`/api/email-accounts?accountId=${encodeURIComponent(accountId)}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Unable to disconnect Gmail.");
    setEmail("");
    setProvider("");
    notify("Gmail account disconnected.");
  };

  const goTo = (next: SetupStep) => {
    if (next >= 1 && selectedIds.size === 0) {
      notify("Select at least one lead before continuing.");
      return;
    }
    if (next >= 2 && !emailPattern.test(email)) {
      notify("Save a sending inbox before continuing.");
      return;
    }
    if (next >= 5 && (!sendingSaved || !warmupAcknowledged)) {
      notify("Save sending preferences and confirm warmup before reviewing.");
      return;
    }
    setLaunchError("");
    setStep(next);
  };

  const handleLaunch = async () => {
    if (!canReview) {
      setLaunchError("Complete lead selection, inbox, sending preferences, and warmup before launching.");
      return;
    }
    try {
      setLaunchError("");
      setLaunchResult(null);
      setIsLaunching(true);
      const result = await onLaunch({
        selectedLeadIds: Array.from(selectedIds),
        selectedLeads: effectiveLeads.filter((lead) => selectedIds.has(lead.id)),
        connectedEmail: email.trim(),
        provider,
      });
      setLaunchResult({ sentCount: result.sentCount, failedCount: result.failedCount, total: result.total });
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Unable to launch campaign.");
    } finally {
      setIsLaunching(false);
    }
  };

  const saveEmailSequence = async (next: CampaignEmail[], personalizedEmails = campaign?.personalizedEmails) => {
    setEmailSequence(next);
    if (!campaign?.id) return;
    try {
      const response = await fetch("/api/campaigns/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          sequence: next,
          personalizedEmails,
          selectedLeadIds: Array.from(selectedIds),
          connectedEmail: email.trim(),
          provider,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save the email sequence.");
      notify("Email sequence saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to save the email sequence.");
    }
  };

  const generateReplacement = async () => {
    const instruction = regenerationPrompt.trim();
    if (!instruction) {
      notify("Enter an instruction before regenerating.");
      return;
    }
    if (!campaign?.id) {
      notify("Save the campaign before regenerating emails.");
      return;
    }
    setIsGenerating(true);
    setGenerationError("");
    try {
      const selectedLeads = effectiveLeads.filter((lead) => selectedIds.has(lead.id));
      const response = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          prompt: brief,
          name: activeCampaignName,
          selectedLeadIds: Array.from(selectedIds),
          selectedLeads,
          instruction,
          currentSequence: emailSequence,
          preview: true,
        }),
      });
      const result = (await response.json()) as { campaign?: Campaign; error?: string };
      if (!response.ok || !result.campaign) throw new Error(result.error ?? "Unable to regenerate the campaign.");
      setPendingSequence(result.campaign.sequence);
      setPendingPersonalizedEmails(result.campaign.personalizedEmails);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Unable to regenerate the campaign.");
    } finally {
      setIsGenerating(false);
    }
  };

  // CSV Import handlers
  const handleCsvFileUpload = (file: File) => {
    setCsvError("");
    setCsvParsedPreview([]);

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv")) {
      setCsvError(REQUIRED_CSV_FORMAT_MESSAGE);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = (e.target?.result as string) || "";
      setCsvRawText(content);
      const result = validateAndParseCsv(file, content);
      if (!result.valid || !result.leads.length) {
        setCsvError(result.errorMessage || REQUIRED_CSV_FORMAT_MESSAGE);
        setCsvParsedPreview([]);
      } else {
        setCsvError("");
        setCsvParsedPreview(result.leads);
      }
    };
    reader.onerror = () => {
      setCsvError(REQUIRED_CSV_FORMAT_MESSAGE);
      setCsvParsedPreview([]);
    };
    reader.readAsText(file);
  };

  const handleApplyCsvImport = () => {
    if (!csvParsedPreview.length) {
      notify("No valid leads to import.");
      return;
    }
    const imported = [...csvParsedPreview];
    setShowCsvModal(false);
    setSelectedIds(new Set(imported.map((lead) => lead.id)));
    setStep(0);
    onImportCsvLeads?.(imported);
    notify(`Successfully imported ${imported.length} prospects.`);
  };

  // ============================================================
  // EMPTY STATE (NO CAMPAIGNS & NO LEADS)
  // ============================================================
  if (!campaign && effectiveLeads.length === 0) {
    return (
      <div className="surface panel max-w-3xl space-y-4">
        <p className="eyebrow">Campaigns</p>
        <h1 className="font-serif text-3xl font-bold text-ink">No campaign started yet.</h1>
        <p className="text-sm text-muted">
          Describe your offer to generate matching leads, or import an existing prospect list to launch a campaign.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-4 flex items-center gap-2"
          onClick={() => setShowNewCampaignModal(true)}
        >
          <Plus className="h-4 w-4" />
          <span>New Campaign</span>
        </button>

        {/* Modal Selection */}
        {showNewCampaignModal && (
          <NewCampaignChoiceModal
            onClose={() => setShowNewCampaignModal(false)}
            onSelectAi={() => {
              setShowNewCampaignModal(false);
              onOpenNewCampaign();
            }}
            onSelectCsv={() => {
              setShowNewCampaignModal(false);
              setShowCsvModal(true);
            }}
          />
        )}
      </div>
    );
  }

  // ============================================================
  // LIVE CAMPAIGNS VIEW (WHEN CAMPAIGN IS LAUNCHED & LIVE)
  // ============================================================
  if (launched) {
    return (
      <div className="relative w-full space-y-6 text-ink">
        {/* Top Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-line pb-4">
          <div>
            <p className="eyebrow">Outbound Pipelines · Campaigns</p>
            <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-ink">
              Live Campaigns
            </h1>
            <p className="mt-1 text-sm text-muted">
              Active outbound workflows delivering deliverability-guarded emails to verified prospects.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewCampaignModal(true)}
            className="btn btn-primary self-start sm:self-auto flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>New Campaign</span>
          </button>
        </div>

        {/* Metrics Strip */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="surface rounded-2xl p-5 border border-line bg-white shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-muted">Live Campaigns</span>
              <Rocket className="h-4 w-4 text-green" />
            </div>
            <strong className="mt-2 block text-2xl font-bold text-ink">
              {liveCampaigns.length || 1} Active
            </strong>
            <span className="mt-1 block text-xs text-muted">
              {campaigns.length} total campaigns in workspace
            </span>
          </div>

          <div className="surface rounded-2xl p-5 border border-line bg-white shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-muted">Target Audience</span>
              <Users className="h-4 w-4 text-green" />
            </div>
            <strong className="mt-2 block text-2xl font-bold text-ink">
              {campaign.leadsCount || selectedIds.size} Prospects
            </strong>
            <span className="mt-1 block text-xs text-muted">
              Included in active sequence
            </span>
          </div>

          <div className="surface rounded-2xl p-5 border border-line bg-white shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-muted">Accepted by Gmail</span>
              <Mail className="h-4 w-4 text-green" />
            </div>
            <strong className="mt-2 block text-2xl font-bold text-ink">
              {campaign.sentCount || 0}
            </strong>
            <span className="mt-1 block text-xs text-muted">
              {campaign.replyRate}% average reply rate
            </span>
          </div>

          <div className="surface rounded-2xl p-5 border border-line bg-white shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold text-muted">Delivery Results</span>
              <ShieldCheck className="h-4 w-4 text-green" />
            </div>
            <strong className={`mt-2 block text-2xl font-bold ${campaign.failedCount ? "text-amber-700" : "text-green"}`}>
              {campaign.failedCount ? `${campaign.failedCount} failed` : "No failed sends"}
            </strong>
            <span className="mt-1 block text-xs text-muted">
              SMTP acceptance only; later bounces are not reported here.
            </span>
          </div>
        </section>

        {/* Primary Live Campaign Spotlight Card */}
        <div className="surface overflow-hidden rounded-3xl border border-line bg-white shadow-xs">
          {/* Brand Green Banner */}
          <div className="flex items-center justify-between gap-4 bg-green-dark px-6 py-4 text-white">
            <div>
              <p className="text-[10px] font-bold tracking-wider text-green-soft uppercase">
                Active Outbound Workflow
              </p>
              <h2 className="mt-0.5 font-serif text-xl font-bold">{campaign.name}</h2>
            </div>
            <span className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {campaign.status === "Partially sent" ? `Partial · ${campaign.sentCount} sent` : `Live · ${campaign.sentCount} sent`}
            </span>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Brief summary */}
            {campaign.brief && (
              <div className="rounded-2xl border border-line bg-canvas p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Campaign Brief & Goal
                </p>
                <p className="mt-1 text-sm text-ink leading-relaxed font-medium">
                  {campaign.brief}
                </p>
              </div>
            )}

            {/* Status Grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-line bg-canvas/70 p-4">
                <span className="text-xs text-muted font-semibold flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-green" /> Audience
                </span>
                <div className="text-base font-bold text-ink mt-1">
                  {campaign.leadsCount || selectedIds.size} Prospects
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate?.("leads")}
                  className="mt-2 text-xs font-semibold text-green hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>View lead list</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              <div className="rounded-2xl border border-line bg-canvas/70 p-4">
                <span className="text-xs text-muted font-semibold flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-green" /> Sending Inbox
                </span>
                <div className="text-base font-bold text-ink mt-1 truncate">
                  {campaign.connectedEmail || email || "Connected Inbox"}
                </div>
                <span className="mt-2 block text-xs text-muted truncate">
                  {campaign.provider || provider || "Google Workspace"}
                </span>
              </div>

              <div className="rounded-2xl border border-line bg-canvas/70 p-4">
                <span className="text-xs text-muted font-semibold flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-green" /> Email Sequence
                </span>
                <div className="text-base font-bold text-ink mt-1">
                  {emailSequence.length || 3} Steps Active
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate?.("email-sequence")}
                  className="mt-2 text-xs font-semibold text-green hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>Review sequence</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>

              <div className="rounded-2xl border border-line bg-canvas/70 p-4">
                <span className="text-xs text-muted font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-green" /> Warmup & Limits
                </span>
                <div className="text-base font-bold text-green mt-1">
                  Protected
                </div>
                <span className="mt-2 block text-xs text-muted">
                  Daily pacing & spam shield
                </span>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-line">
              <button
                type="button"
                className="btn btn-primary text-xs cursor-pointer flex items-center gap-1.5"
                onClick={() => onNavigate?.("leads")}
              >
                <Users className="h-3.5 w-3.5" />
                <span>View Audience Leads</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary text-xs cursor-pointer flex items-center gap-1.5"
                onClick={() => onNavigate?.("email-sequence")}
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Email Sequence</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary text-xs cursor-pointer flex items-center gap-1.5"
                onClick={() => onNavigate?.("inbox")}
              >
                <Inbox className="h-3.5 w-3.5" />
                <span>Open Inbox</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary text-xs cursor-pointer flex items-center gap-1.5"
                onClick={() => onNavigate?.("analytics")}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Analytics</span>
              </button>
            </div>
          </div>
        </div>

        {/* Portfolio Table */}
        <section className="surface rounded-3xl p-6 border border-line bg-white shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <p className="eyebrow">All Campaigns</p>
              <h2 className="mt-1 font-serif text-xl font-bold text-ink">Campaign Portfolio</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowNewCampaignModal(true)}
              className="text-xs font-bold text-green hover:underline cursor-pointer flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create another campaign</span>
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {campaigns.map((item) => {
              const isItemActive = item.id === campaign.id;
              const isItemLive = item.status === "Live";

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectCampaign?.(item.id);
                  }}
                  className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${
                    isItemActive
                      ? "border-green bg-green-soft/30 shadow-xs"
                      : "border-line bg-canvas hover:border-green/60 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-ink text-sm">{item.name}</span>
                    <span className={`status ${isItemLive ? "good" : "warn"}`}>
                      {isItemLive ? "Live" : item.status || "Draft"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted font-normal">
                    {item.brief || "No brief description"}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted border-t border-line/60 pt-2">
                    <span>{item.leadsCount} leads</span>
                    <span>{item.sentCount} sent · {item.failedCount ?? 0} failed</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Choice Modal */}
        {showNewCampaignModal && (
          <NewCampaignChoiceModal
            onClose={() => setShowNewCampaignModal(false)}
            onSelectAi={() => {
              setShowNewCampaignModal(false);
              onOpenNewCampaign();
            }}
            onSelectCsv={() => {
              setShowNewCampaignModal(false);
              setShowCsvModal(true);
            }}
          />
        )}

        {/* CSV Modal */}
        {showCsvModal && (
          <CsvImportModal
            onClose={() => setShowCsvModal(false)}
            onUploadFile={handleCsvFileUpload}
            onApply={handleApplyCsvImport}
            previewLeads={csvParsedPreview}
            error={csvError}
          />
        )}
      </div>
    );
  }

  // ============================================================
  // SETUP / DRAFT WORKFLOW (FOR CAMPAIGNS CURRENTLY IN PROGRESS)
  // ============================================================
  return (
    <div className="relative w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.13em] text-green uppercase">Campaign Setup Workspace</p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-ink">{activeCampaignName}</h1>
          {brief && <p className="mt-2 max-w-3xl text-sm text-muted">Built around your brief: “{brief}”</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${launched ? "bg-green-soft text-green" : "bg-gold-soft text-gold"}`}>
            {launched ? "Campaign live" : campaign?.status ?? "Draft"}
          </span>
          <button
            className="btn btn-primary text-xs flex items-center gap-1.5"
            type="button"
            onClick={() => setShowNewCampaignModal(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New campaign</span>
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-1">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => goTo(index as SetupStep)}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${
              step === index ? "bg-green text-white" : index < step ? "bg-green-soft text-green" : "text-muted hover:bg-mist"
            }`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <section className="w-full">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">{importedOnly ? "Imported leads" : "All leads"}</p>
              <h2 className="mt-1 text-2xl font-bold">{importedOnly ? "Imported leads" : "Review your matching audience."}</h2>
              <p className="mt-2 text-sm text-muted">
                {importedOnly
                  ? "Showing the records from your CSV import."
                  : "Search and filter the loaded lead list, then select who belongs in this campaign."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCsvModal(true)}
                className="btn btn-secondary text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[#0a66c2]" />
                <span>Import CSV</span>
              </button>
              <span className="status good">{effectiveLeads.length} loaded leads</span>
            </div>
          </div>
          <LeadManagementView
            leads={effectiveLeads}
            selectedLeadIds={selectedIds}
            onToggleLead={(id) => {
              const next = new Set(selectedIds);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              setSelectedIds(next);
            }}
            onSelectAll={(ids = leads.map((lead) => lead.id)) => setSelectedIds(new Set(ids))}
            onClearAll={() => setSelectedIds(new Set())}
            onAddToConnect={importedOnly ? undefined : onAddToConnect}
            onContinue={() => goTo(1)}
            continueLabel="Continue to campaign setup"
            showFilters={!importedOnly}
            readOnly={importedOnly}
          />
        </section>
      )}

      {step === 2 && (
        <div className="grid items-start gap-5 2xl:grid-cols-[minmax(220px,0.8fr)_minmax(420px,1.45fr)_minmax(260px,0.85fr)]">
          <section className="surface panel !max-w-none">
            <div className="mt-5 rounded-xl bg-green-soft p-4">
              <strong>Selected audience</strong>
              <p className="mt-2 text-2xl font-bold text-green">{selectedIds.size} selected leads</p>
              <p className="mt-2 text-sm text-muted">Only selected contacts will be included at launch.</p>
            </div>
          </section>

          <section className="surface panel !max-w-none">
            <p className="eyebrow">Email sequence</p>
            <h2 className="mt-2 text-xl font-bold">Review your generated emails</h2>
            <p className="mt-2 text-sm text-muted">Personalized using the saved campaign context and selected lead data.</p>
            {!emailSequence.length && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">No generated email sequence is saved for this campaign.</p>}
            <div className="mt-5 space-y-4">
              {emailSequence.map((email, index) => (
                <article key={email.step} className="rounded-xl border border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <span className="status good">{index === 0 ? "Initial Email" : `Follow-up ${index}`}</span>
                      <p className="mt-2 text-xs text-muted">{index === 0 ? "Send after launch" : `${email.delayDays} days after previous email`}</p>
                    </div>
                    <button className="btn btn-secondary text-xs" type="button" onClick={() => setEditingEmail(editingEmail === index ? null : index)}>
                      <Pencil className="h-3.5 w-3.5" /> {editingEmail === index ? "Close" : "Edit"}
                    </button>
                  </div>
                  {editingEmail === index ? (
                    <div className="mt-4 grid gap-3">
                      <label className="text-sm font-semibold">Subject<input className="input mt-2" value={email.subject} onChange={(event) => setEmailSequence((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, subject: event.target.value, manuallyEdited: true } : item))} /></label>
                      <label className="text-sm font-semibold">Body<textarea className="input mt-2 min-h-28" value={email.body} onChange={(event) => setEmailSequence((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value, manuallyEdited: true } : item))} /></label>
                      <button className="btn btn-primary justify-self-start text-xs" type="button" onClick={() => { saveEmailSequence(emailSequence); setEditingEmail(null); }}>Save email</button>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted">Subject</p><p className="mt-1 text-sm font-bold">{email.subject}</p></div>
                      <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted">Body</p><p className="mt-1 whitespace-pre-line rounded-lg bg-mist p-3 text-sm leading-relaxed">{email.body}</p></div>
                      <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted">Recipients</p><p className="mt-1 text-sm">{effectiveLeads.filter((lead) => selectedIds.has(lead.id)).map((lead) => lead.name).join(", ") || "Selected leads"}</p></div>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted"><CheckCircle2 className="h-4 w-4 text-green" /> Saved to campaign</div>
                </article>
              ))}
            </div>
          </section>

          <section className="surface panel !max-w-none">
            <p className="eyebrow">Regenerate campaign</p>
            <h2 className="mt-2 text-xl font-bold">Improve the sequence</h2>
            <p className="mt-2 text-sm text-muted">Keep the original campaign context and add an instruction for the updated emails.</p>
            <label className="mt-5 block text-sm font-semibold">
              New instructions
              <textarea className="input mt-2 min-h-32" value={regenerationPrompt} onChange={(event) => setRegenerationPrompt(event.target.value)} placeholder="Make this email shorter and more professional." />
            </label>
            <button className="btn btn-primary mt-4 w-full" type="button" onClick={generateReplacement} disabled={isGenerating}>{isGenerating ? "Generating with Groq..." : "Regenerate Campaign"}</button>
            {generationError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{generationError}</p>}
            {pendingSequence && (
              <div className="mt-5 rounded-xl border border-green/20 bg-green-soft p-4">
                <p className="text-sm font-bold">Generated result ready for review</p>
                <p className="mt-2 text-xs text-muted">{pendingSequence[0].subject}</p>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary text-xs" type="button" onClick={() => { saveEmailSequence(pendingSequence, pendingPersonalizedEmails); setPendingSequence(null); setPendingPersonalizedEmails(undefined); setRegenerationPrompt(""); }}>Apply generated emails</button>
                  <button className="btn btn-secondary text-xs" type="button" onClick={() => { setPendingSequence(null); setPendingPersonalizedEmails(undefined); }}>Discard</button>
                </div>
              </div>
            )}
            <CardActions onBack={() => goTo(1)} onNext={() => goTo(3)} nextLabel="Next: Sending settings" disabled={!emailSequence.length} />
          </section>
        </div>
      )}

      {step === 1 && (
        <SetupCard eyebrow="Setup step 1 of 6" title="Connect your sending inbox." description="Authorize the Gmail account that this campaign will send from.">
          {campaign?.id ? (
            <ConnectGmail
              campaignId={campaign.id}
              connectedEmail={email}
              onConnected={saveConnectedAccount}
              onDisconnected={disconnectConnectedAccount}
            />
          ) : (
            <p className="mt-5 text-sm text-muted">Save the campaign before connecting Gmail.</p>
          )}
          <CardActions onBack={() => goTo(0)} onNext={() => goTo(2)} nextLabel="Next: Review emails" disabled={!provider || !email} />
        </SetupCard>
      )}

      {step === 3 && (
        <SetupCard eyebrow="Setup step 3 of 6" title="Configure sending safeguards." description="Confirm sending email and daily volume pacing before launching.">
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-semibold">
              Sending email
              <input className="input mt-2" type="email" value={email} readOnly />
            </label>
            <div className="rounded-xl border border-line bg-canvas p-4 text-xs text-muted">
              <strong>10 recipients per launch</strong> and <strong>50 per sender per rolling 24 hours</strong>. These caps reduce sudden volume; they do not guarantee inbox placement.
            </div>
            <button
              type="button"
              className="btn btn-primary text-xs"
              onClick={() => {
                if (!emailPattern.test(email.trim())) {
                  notify("Please enter a valid sending email.");
                  return;
                }
                setSendingSaved(true);
                notify("Sending settings saved.");
              }}
            >
              {sendingSaved ? "Settings Saved" : "Save Sending Settings"}
            </button>
          </div>
          <CardActions onBack={() => goTo(2)} onNext={() => goTo(4)} nextLabel="Next: Warmup" disabled={!sendingSaved} />
        </SetupCard>
      )}

      {step === 4 && (
        <SetupCard eyebrow="Setup step 4 of 6" title="Review domain authentication." description="DNS authentication must be configured with your email provider before sending from a custom domain.">
          <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-line bg-canvas p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <ShieldCheck className="h-5 w-5 text-green" />
                <span>SPF, DKIM, and DMARC</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Configure SPF and DKIM as directed by Google Workspace, then publish a DMARC policy for your domain. LeadLens cannot create or verify DNS records and does not run an inbox warmup service.
              </p>
              <label className="flex items-center gap-2 pt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={warmupAcknowledged}
                  onChange={(e) => setWarmupAcknowledged(e.target.checked)}
                  className="h-4 w-4 rounded accent-green cursor-pointer"
                />
                <span className="text-xs font-semibold text-ink">
                  I have checked my sending-domain authentication and recipient eligibility.
                </span>
              </label>
            </div>
          </div>
          <CardActions onBack={() => goTo(3)} onNext={() => goTo(5)} nextLabel="Next: Review campaign" disabled={!warmupAcknowledged} />
        </SetupCard>
      )}

      {step === 5 && (
        <SetupCard eyebrow="Setup step 5 of 6" title="Review before launch." description="Verify all audience, email sequence, and sending parameters.">
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-canvas p-4 space-y-1">
              <span className="text-[10px] font-bold text-muted uppercase">Audience</span>
              <p className="font-bold text-sm text-ink">{selectedIds.size} Prospects Selected</p>
            </div>
            <div className="rounded-2xl border border-line bg-canvas p-4 space-y-1">
              <span className="text-[10px] font-bold text-muted uppercase">Sender Inbox</span>
              <p className="font-bold text-sm text-ink">{email} ({provider})</p>
            </div>
            <div className="rounded-2xl border border-line bg-canvas p-4 space-y-1">
              <span className="text-[10px] font-bold text-muted uppercase">Email Sequence</span>
              <p className="font-bold text-sm text-ink">{emailSequence.length} Steps Configured</p>
            </div>
            <div className="rounded-2xl border border-line bg-canvas p-4 space-y-1">
              <span className="text-[10px] font-bold text-muted uppercase">Safeguards</span>
              <p className="font-bold text-sm text-green">Warmup & Limits Verified</p>
            </div>
          </div>
          <CardActions onBack={() => goTo(4)} onNext={() => goTo(6)} nextLabel="Next: Launch" />
        </SetupCard>
      )}

      {step === 6 && (
        <SetupCard eyebrow="Final step" title="Ready to launch your campaign." description="Your verified contacts and sequences are ready to run.">
          <div className="mt-6 space-y-4">
            {launchError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {launchError}
              </div>
            )}
            {launchResult && (
              <div className={`rounded-xl border p-3 text-xs ${launchResult.failedCount ? "border-amber-200 bg-amber-50 text-amber-800" : "border-green/20 bg-green-soft text-green-dark"}`} role="status">
                Sent {launchResult.sentCount} of {launchResult.total} emails. {launchResult.failedCount} failed.
              </div>
            )}
            <div className="rounded-2xl border border-green/20 bg-green-soft p-5">
              <p className="font-bold text-sm text-green-dark">Everything is configured.</p>
              <p className="mt-1 text-xs text-green-dark/80">
                Launch sends each lead their own personalized first-step email from your Gmail account and records the result.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLaunch}
              disabled={isLaunching}
              className="btn btn-primary w-full text-sm py-3 cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              <Rocket className="h-4 w-4" />
              <span>{isLaunching ? "Sending emails..." : "Launch Campaign"}</span>
            </button>
          </div>
          <CardActions onBack={() => goTo(5)} onNext={() => {}} nextLabel="Launched" disabled />
        </SetupCard>
      )}

      {/* Choice Modal */}
      {showNewCampaignModal && (
        <NewCampaignChoiceModal
          onClose={() => setShowNewCampaignModal(false)}
          onSelectAi={() => {
            setShowNewCampaignModal(false);
            onOpenNewCampaign();
          }}
          onSelectCsv={() => {
            setShowNewCampaignModal(false);
            setShowCsvModal(true);
          }}
        />
      )}

      {/* CSV Modal */}
      {showCsvModal && (
        <CsvImportModal
          onClose={() => setShowCsvModal(false)}
          onUploadFile={handleCsvFileUpload}
          onApply={handleApplyCsvImport}
          previewLeads={csvParsedPreview}
          error={csvError}
        />
      )}

      {toast && (
        <div role="status" className="fixed right-5 bottom-5 z-[100] rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MODAL: NEW CAMPAIGN (CAMPAIGN WITH AI vs IMPORT CSV)
// ============================================================
function NewCampaignChoiceModal({
  onClose,
  onSelectAi,
  onSelectCsv,
}: {
  onClose: () => void;
  onSelectAi: () => void;
  onSelectCsv: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-line bg-white p-6 sm:p-8 shadow-2xl text-ink space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="eyebrow">Create Campaign</p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-ink">New Campaign</h2>
            <p className="mt-1 text-xs text-muted">
              Choose how you would like to source your audience and build your campaign.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-mist text-muted hover:text-ink cursor-pointer"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Option 1: Campaign with AI */}
          <button
            type="button"
            onClick={onSelectAi}
            className="group flex flex-col justify-between rounded-2xl border-2 border-line bg-canvas/60 p-5 text-left transition-all hover:border-green hover:bg-green-soft/30 hover:shadow-xs cursor-pointer"
          >
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-soft text-green shadow-2xs group-hover:scale-105 transition-transform">
                <Sparkles className="h-5 w-5 text-green" />
              </div>
              <h3 className="mt-3 font-serif text-lg font-bold text-ink group-hover:text-green transition-colors">
                Campaign with AI
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Describe your ICP and offer in natural language. Our AI discovers verified prospects, confirms domains, and generates custom emails.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-[11px] font-bold text-green">
              <span>Recommended</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Option 2: Import CSV */}
          <button
            type="button"
            onClick={onSelectCsv}
            className="group flex flex-col justify-between rounded-2xl border-2 border-line bg-canvas/60 p-5 text-left transition-all hover:border-[#0a66c2] hover:bg-blue-50/40 hover:shadow-xs cursor-pointer"
          >
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0a66c2] shadow-2xs group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="h-5 w-5 text-[#0a66c2]" />
              </div>
              <h3 className="mt-3 font-serif text-lg font-bold text-ink group-hover:text-[#0a66c2] transition-colors">
                Import CSV
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Upload your own list of leads from Apollo, ZoomInfo, Clay, or your CRM. Map contact columns and start an outreach sequence.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-[11px] font-bold text-[#0a66c2]">
              <span>Custom List</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MODAL: CSV IMPORT DROPZONE & PREVIEW
// ============================================================
function CsvImportModal({
  onClose,
  onUploadFile,
  onApply,
  previewLeads,
  error,
}: {
  onClose: () => void;
  onUploadFile: (file: File) => void;
  onApply: () => void;
  previewLeads: Lead[];
  error: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const requiredColumns = [
    "Person",
    "Role",
    "Company",
    "Email",
    "LinkedIn Profile",
    "Industry",
    "Location",
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border border-line bg-white p-6 sm:p-8 shadow-2xl text-ink space-y-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="eyebrow">Audience Import · CSV Only</p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-ink">Import Prospect CSV</h2>
            <p className="mt-1 text-xs text-muted">
              Upload your validated CSV contact list. Strictly supports comma-separated (<span className="font-mono text-ink font-semibold">.csv</span>) files.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-mist text-muted hover:text-ink cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Required Format Information Banner */}
        <div className="rounded-2xl border border-line bg-canvas/60 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink uppercase tracking-wider">
              Required Column Format (in order):
            </span>
            <span className="text-[11px] font-semibold text-muted">7 required columns</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {requiredColumns.map((col) => (
              <span
                key={col}
                className="inline-flex items-center rounded-lg border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-ink shadow-2xs"
              >
                {col}
              </span>
            ))}
          </div>
        </div>

        {/* Dropzone */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onUploadFile(file);
          }}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-150 ${
            isDragging
              ? "border-green bg-green-50/50 scale-[0.99]"
              : "border-line hover:border-green/80 bg-canvas/40 hover:bg-canvas/80"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white border border-line shadow-2xs">
            <Upload className="h-6 w-6 text-green" />
          </div>
          <span className="mt-3 text-sm font-bold text-ink">Click to upload or drag & drop CSV</span>
          <span className="text-xs text-muted mt-1">Accepts <span className="font-semibold text-ink">.csv</span> files only (Excel, PDF, or DOC are not supported)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadFile(file);
            }}
          />
        </label>

        {/* Download CSV Template Button Area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-line bg-mist/40 p-3.5">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-ink">Need the pre-built template?</span>
            <p className="text-[11px] text-muted">
              Download a ready-to-use CSV template with the exact required header format and sample rows.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="flex items-center justify-center gap-2 rounded-xl border border-line bg-white hover:bg-mist px-3.5 py-2 text-xs font-bold text-ink shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <Download className="h-4 w-4 text-green" />
            <span>Download CSV Template</span>
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-red-900">Format Verification Notice</p>
              <p className="leading-relaxed font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* Parsed Preview */}
        {previewLeads.length > 0 && !error && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink">
                Parsed Prospects Preview ({previewLeads.length} valid contacts detected)
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green">
                <Check className="h-3.5 w-3.5" /> Ready to import
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-2xl border border-line divide-y divide-line text-xs bg-canvas/40 shadow-2xs">
              {previewLeads.slice(0, 5).map((lead, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink">{lead.name}</span>
                      <span className="text-muted text-[11px]">· {lead.jobTitle}</span>
                    </div>
                    <div className="text-[11px] text-muted truncate mt-0.5">
                      {lead.company} · {lead.industry} · {lead.location}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-muted shrink-0 bg-white px-2 py-0.5 rounded-md border border-line">
                    {lead.email}
                  </span>
                </div>
              ))}
              {previewLeads.length > 5 && (
                <div className="p-2.5 text-center text-[11px] text-muted italic bg-mist/30">
                  + {previewLeads.length - 5} additional prospects validated and ready
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-line">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            disabled={!previewLeads.length || Boolean(error)}
            onClick={onApply}
            className="btn btn-primary text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import {previewLeads.length} Leads & Start Campaign
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="surface panel max-w-4xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {children}
    </section>
  );
}

function CardActions({
  onBack,
  onNext,
  nextLabel,
  disabled = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-between gap-3">
      <button className="btn btn-secondary" type="button" onClick={onBack}>
        Previous
      </button>
      <button className="btn btn-primary" type="button" disabled={disabled} onClick={onNext}>
        {nextLabel}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
