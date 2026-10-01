"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { AppModule, Campaign, Lead } from "../../types";
import PromptOverlay from "../onboarding/PromptOverlay";
import AppShell from "../layout/AppShell";
import type { CampaignLaunchContext } from "../modules/CampaignsModule";
import type { LeadGenerationContext } from "../modules/LeadGenerationModule";

const moduleLoading = () => (
  <div className="flex min-h-48 items-center justify-center text-sm text-muted" role="status">
    Loading workspace module...
  </div>
);

const DashboardModule = dynamic(() => import("../modules/DashboardModule"), { loading: moduleLoading });
const CampaignsModule = dynamic(() => import("../modules/CampaignsModule"), { loading: moduleLoading });
const LeadsModule = dynamic(() => import("../modules/LeadsModule"), { loading: moduleLoading });
const AnalyticsModule = dynamic(() => import("../modules/AnalyticsModule"), { loading: moduleLoading });
const SettingsModule = dynamic(() => import("../modules/SettingsModule"), { loading: moduleLoading });
const InboxModule = dynamic(() => import("../modules/InboxModule"), { loading: moduleLoading });
const MeetingsModule = dynamic(() => import("../modules/MeetingsModule"), { loading: moduleLoading });
const LeadGenerationModule = dynamic(() => import("../modules/LeadGenerationModule"), { loading: moduleLoading });
const EmailSequenceModule = dynamic(() => import("../modules/EmailSequenceModule"), { loading: moduleLoading });

function campaignNameFromBrief(brief: string) {
  const compact = brief.trim().replace(/\s+/g, " ");
  return compact.length > 48 ? `${compact.slice(0, 48)}…` : compact;
}

export default function DashboardAppClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status: sessionStatus } = useSession();
  const [currentModule, setCurrentModule] = useState<AppModule>("dashboard");
  const [isPromptOverlayOpen, setIsPromptOverlayOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [campaignLaunchContext, setCampaignLaunchContext] = useState<CampaignLaunchContext | null>(null);
  const [standaloneCampaignEntry, setStandaloneCampaignEntry] = useState(false);
  const [leadGenerationPrompt, setLeadGenerationPrompt] = useState("");
  const [sequenceLeads, setSequenceLeads] = useState<Lead[]>([]);
  const [generatedLeads, setGeneratedLeads] = useState<Lead[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [onboardingGenerating, setOnboardingGenerating] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const hasInitializedWorkspace = useRef(false);

  // Check query params on mount
  useEffect(() => {
    if (searchParams.get("action") === "new-campaign") {
      const timer = window.setTimeout(() => setIsPromptOverlayOpen(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams]);

  // Load saved context inside dashboard workspace
  useEffect(() => {
    const saved = window.localStorage.getItem("leadlens-workspace-context");
    if (saved) {
      try {
        const context = JSON.parse(saved) as LeadGenerationContext;
        const timer = window.setTimeout(() => {
          setLeadGenerationPrompt(context.prompt);
          setGeneratedLeads(context.allLeads ?? context.selectedLeads ?? []);
          setCampaignLaunchContext(context);
        }, 0);
        return () => window.clearTimeout(timer);
      } catch {
        window.localStorage.removeItem("leadlens-workspace-context");
      }
    }
  }, []);

  const handleLeadGenerationComplete = async (context: LeadGenerationContext) => {
    const response = await fetch("/api/campaigns/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: context.prompt,
        name: campaignNameFromBrief(context.prompt),
        selectedLeadIds: context.selectedLeadIds,
        selectedLeads: context.selectedLeads,
      }),
    });

    const result = (await response.json()) as {
      campaign?: Campaign & { prompt: string; selectedLeads?: Lead[] };
      error?: string;
    };

    if (!response.ok || !result.campaign) {
      throw new Error(result.error ?? "Unable to generate campaign emails.");
    }

    window.localStorage.setItem("leadlens-workspace-context", JSON.stringify(context));
    setGeneratedLeads(context.allLeads);

    const newCampaign: Campaign = {
      id: result.campaign.id,
      name: result.campaign.name,
      brief: result.campaign.prompt,
      status: "Ready",
      leadsCount: context.allLeads.length,
      sentCount: 0,
      replyRate: 0,
      sequence: result.campaign.sequence,
    };

    setCampaigns((current) => [newCampaign, ...current.filter((c) => c.id !== newCampaign.id)]);
    setActiveCampaignId(newCampaign.id);
    setCampaignLaunchContext(context);
    setStandaloneCampaignEntry(true);
    setCurrentModule("campaign");
  };

  // Detect and process pending onboarding right after Google Authentication
  useEffect(() => {
    if (sessionStatus === "loading" || hasInitializedWorkspace.current) return;

    if (sessionStatus !== "authenticated") {
      const hasPendingOnboarding = Boolean(window.localStorage.getItem("leadlens-pending-onboarding"));
      const callbackPath = hasPendingOnboarding ? "/dashboard?continue=onboarding" : "/dashboard";
      router.replace(`/login?callbackUrl=${encodeURIComponent(callbackPath)}&error=SessionRequired`);
      return;
    }

    hasInitializedWorkspace.current = true;

    const pending = window.localStorage.getItem("leadlens-pending-onboarding");
    if (pending) {
      let pendingContext: {
        prompt: string;
        selectedLeadIds: string[];
        selectedLeads: Lead[];
        allLeads: Lead[];
      } | null = null;

      try {
        const parsedContext = JSON.parse(pending) as {
          prompt: string;
          selectedLeadIds: string[];
          selectedLeads: Lead[];
          allLeads: Lead[];
        };
        if (
          !parsedContext.prompt ||
          !Array.isArray(parsedContext.selectedLeadIds) ||
          !Array.isArray(parsedContext.selectedLeads) ||
          !Array.isArray(parsedContext.allLeads)
        ) {
          throw new Error("Pending campaign data is incomplete.");
        }
        pendingContext = parsedContext;
      } catch {
        window.localStorage.removeItem("leadlens-pending-onboarding");
      }

      if (pendingContext) {
        void Promise.resolve()
          .then(() => {
            setOnboardingGenerating(true);
            setOnboardingError("");
            return handleLeadGenerationComplete({
              prompt: pendingContext.prompt,
              selectedLeadIds: pendingContext.selectedLeadIds,
              selectedLeads: pendingContext.selectedLeads,
              allLeads: pendingContext.allLeads,
              connectedEmail: "",
              provider: "Google Workspace / Gmail",
            });
          })
          .then(() => {
            window.localStorage.removeItem("leadlens-pending-onboarding");
          })
          .catch((err) => {
            console.error("[Dashboard] Error continuing onboarding after Google sign-in:", err);
            setOnboardingError(err instanceof Error ? err.message : "Failed to generate campaign emails with Groq AI.");
          })
          .finally(() => {
            setOnboardingGenerating(false);
            setLoadingWorkspace(false);
          });
        return;
      }
    }

    // Normal campaign fetch if no pending onboarding
    fetch("/api/campaigns")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          campaigns?: Array<Campaign & { selectedLeads?: Lead[]; emails?: Campaign["sequence"] }>;
        };
      })
      .then((result) => {
        const savedCampaigns = result?.campaigns ?? [];
        if (!savedCampaigns.length) return;

        const restoredCampaigns = savedCampaigns.map((saved) => ({
          ...saved,
          sequence: saved.sequence ?? saved.emails ?? [],
        }));

        setCampaigns(restoredCampaigns);
        setActiveCampaignId((current) => current || restoredCampaigns[0].id);

        const savedCampaign = savedCampaigns[0];
        const savedLeads = savedCampaign.selectedLeads ?? [];
        setGeneratedLeads((current) => (current.length ? current : savedLeads));

        setCampaignLaunchContext((current) => current ?? {
          prompt: savedCampaign.brief,
          selectedLeadIds: savedCampaign.selectedLeadIds ?? savedLeads.map((lead) => lead.id),
          selectedLeads: savedLeads,
          connectedEmail: savedCampaign.connectedEmail ?? "",
          provider: savedCampaign.provider ?? "",
          allLeads: savedLeads,
        });
      })
      .catch((error) => console.error("[Dashboard] Error loading campaigns:", error))
      .finally(() => setLoadingWorkspace(false));
  }, [sessionStatus, router]);

  const handlePromptSubmitted = (prompt: string) => {
    setLeadGenerationPrompt(prompt);
    setCurrentModule("lead-generation");
    setStandaloneCampaignEntry(false);
  };

  const handleCampaignLaunched = async (payload: {
    selectedLeadIds: string[];
    selectedLeads: Lead[];
    connectedEmail: string;
    provider: string;
  }): Promise<{ sentCount: number; failedCount: number; pendingCount: number; total: number; status: Campaign["status"] }> => {
    if (!activeCampaignId) throw new Error("Save the campaign before launching it.");
    const response = await fetch("/api/campaigns/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: activeCampaignId, ...payload }),
    });
    const result = (await response.json()) as { status?: Campaign["status"]; startedAt?: string; sentCount?: number; failedCount?: number; pendingCount?: number; total?: number; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Unable to send campaign emails.");

    const selectedLeads = payload.selectedLeads;

    setCampaignLaunchContext((current) => ({
      prompt: current?.prompt ?? leadGenerationPrompt,
      selectedLeadIds: payload.selectedLeadIds,
      selectedLeads,
      connectedEmail: payload.connectedEmail,
      provider: payload.provider,
      allLeads: generatedLeads,
    }));

    setCampaigns((current) =>
      current.map((campaign) =>
        campaign.id === activeCampaignId
          ? {
              ...campaign,
              status: result.status ?? "Failed",
              startedAt: result.startedAt ?? campaign.startedAt,
              leadsCount: payload.selectedLeadIds.length,
              sentCount: result.sentCount ?? 0,
              failedCount: result.failedCount ?? 0,
              replyRate: 0,
            }
          : campaign,
      ),
    );

    setStandaloneCampaignEntry(false);
    return {
      sentCount: result.sentCount ?? 0,
      failedCount: result.failedCount ?? 0,
      pendingCount: result.pendingCount ?? 0,
      total: result.total ?? payload.selectedLeadIds.length,
      status: result.status ?? "Failed",
    };
  };

  const handleSelectCampaign = (campaignId: string) => {
    setActiveCampaignId(campaignId);
    const target = campaigns.find((c) => c.id === campaignId);
    if (target) {
      const targetLeads = (target.selectedLeads as Lead[]) ?? [];
      if (targetLeads.length > 0) {
        setGeneratedLeads(targetLeads);
      }
      setCampaignLaunchContext({
        prompt: target.prompt || target.brief || "",
        selectedLeadIds: target.selectedLeadIds ?? targetLeads.map((l) => l.id),
        selectedLeads: targetLeads,
        connectedEmail: target.connectedEmail ?? "",
        provider: target.provider ?? "",
        allLeads: targetLeads,
      });
    }
  };

  const handleSendMail = (selectedLeads: Lead[]) => {
    setSequenceLeads(selectedLeads);
    setCurrentModule("email-sequence");
  };

  const handleImportCsvLeads = async (importedLeads: Lead[]) => {
    if (!importedLeads.length) return;

    setGeneratedLeads(importedLeads);
    setSequenceLeads(importedLeads);

    const leadCount = importedLeads.length;
    const uniqueCompanies = Array.from(new Set(importedLeads.map((lead) => lead.company.trim())))
      .filter((company) => company && company.toLowerCase() !== "enterprise");
    const companySummary = uniqueCompanies.slice(0, 3).join(", ") + (uniqueCompanies.length > 3 ? " and more" : "");
    const contactSummary = importedLeads
      .slice(0, 3)
      .map((lead) => (/^Lead \d+$/i.test(lead.name.trim()) ? lead.email : lead.name || lead.email))
      .filter(Boolean)
      .join(", ");
    const campaignName = companySummary || contactSummary;
    const prompt = `Outreach campaign for ${leadCount} imported prospects across ${companySummary}.`;

    const defaultSequence: Campaign["sequence"] = [
      {
        step: 1,
        delayDays: 0,
        subject: "A question about {{company}}",
        body: `Hi {{first_name}},\n\nI'm reaching out about ${prompt} given your {{job_title}} role at {{company}}. Would a brief conversation be useful?\n\nRegards,`,
        manuallyEdited: false,
      },
      {
        step: 2,
        delayDays: 3,
        subject: "One more thought for {{company}}",
        body: `Hi {{first_name}},\n\nOne more note about ${prompt}. If this is relevant to your work at {{company}}, would you be open to a short conversation?\n\nRegards,`,
        manuallyEdited: false,
      },
      {
        step: 3,
        delayDays: 5,
        subject: "Should I close the loop, {{first_name}}?",
        body: `Hi {{first_name}},\n\nIs ${prompt} a priority for your team at {{company}}? If not, no problem; I won't follow up again.\n\nRegards,`,
        manuallyEdited: false,
      },
    ];

    const personalizedEmails: Campaign["personalizedEmails"] = {};
    for (const lead of importedLeads) {
      const firstName = lead.firstName || lead.name.trim().split(/\s+/)[0] || lead.name;
      personalizedEmails[lead.id] = defaultSequence.map((seq) => ({
        step: seq.step,
        delayDays: seq.delayDays,
        subject: seq.subject
          .replace(/\{\{\s*first_?name\s*\}\}/gi, firstName)
          .replace(/\{\{\s*company\s*\}\}/gi, lead.company || "your team")
          .replace(/\{\{\s*role\s*\}\}/gi, lead.jobTitle || lead.role || "team")
          .replace(/\{\{\s*location\s*\}\}/gi, lead.location || "your region"),
        body: seq.body
          .replace(/\{\{\s*first_?name\s*\}\}/gi, firstName)
          .replace(/\{\{\s*company\s*\}\}/gi, lead.company || "your company")
          .replace(/\{\{\s*role\s*\}\}/gi, lead.jobTitle || lead.role || "Executive")
          .replace(/\{\{\s*industry\s*\}\}/gi, lead.industry || "your industry")
          .replace(/\{\{\s*location\s*\}\}/gi, lead.location || "your region"),
        manuallyEdited: false,
      }));
    }

    const selectedLeadIds = importedLeads.map((l) => l.id);

    try {
      const response = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          prompt,
          selectedLeadIds,
          selectedLeads: importedLeads,
          currentSequence: defaultSequence,
        }),
      });

      const result = (await response.json()) as {
        campaign?: Campaign & { prompt: string; selectedLeads?: Lead[] };
        error?: string;
      };
      const savedCampaign: Campaign = result.campaign
        ? {
            id: result.campaign.id,
            name: result.campaign.name,
            brief: result.campaign.prompt || prompt,
            status: "Ready",
            leadsCount: leadCount,
            sentCount: 0,
            replyRate: 0,
            sequence: result.campaign.sequence?.length ? result.campaign.sequence : defaultSequence,
            personalizedEmails: result.campaign.personalizedEmails || personalizedEmails,
            selectedLeadIds,
            selectedLeads: importedLeads,
          }
        : {
            id: `campaign-csv-${Date.now()}`,
            name: campaignName,
            brief: prompt,
            status: "Ready",
            leadsCount: leadCount,
            sentCount: 0,
            replyRate: 0,
            sequence: defaultSequence,
            personalizedEmails,
            selectedLeadIds,
            selectedLeads: importedLeads,
          };

      const context: CampaignLaunchContext = {
        prompt,
        selectedLeadIds,
        selectedLeads: importedLeads,
        connectedEmail: campaignLaunchContext?.connectedEmail ?? "",
        provider: campaignLaunchContext?.provider ?? "",
        allLeads: importedLeads,
      };

      window.localStorage.setItem("leadlens-workspace-context", JSON.stringify(context));
      setCampaignLaunchContext(context);
      setCampaigns((current) => [savedCampaign, ...current.filter((c) => c.id !== savedCampaign.id)]);
      setActiveCampaignId(savedCampaign.id);
      setStandaloneCampaignEntry(false);
      setCurrentModule("campaign");
    } catch (err) {
      console.error("[Dashboard] Failed to create campaign on server for CSV leads:", err);
      const fallbackCampaign: Campaign = {
        id: `campaign-csv-${Date.now()}`,
        name: campaignName,
        brief: prompt,
        status: "Ready",
        leadsCount: leadCount,
        sentCount: 0,
        replyRate: 0,
        sequence: defaultSequence,
        personalizedEmails,
        selectedLeadIds,
        selectedLeads: importedLeads,
      };

      const context: CampaignLaunchContext = {
        prompt,
        selectedLeadIds,
        selectedLeads: importedLeads,
        connectedEmail: campaignLaunchContext?.connectedEmail ?? "",
        provider: campaignLaunchContext?.provider ?? "",
        allLeads: importedLeads,
      };

      setCampaignLaunchContext(context);
      setCampaigns((current) => [fallbackCampaign, ...current.filter((c) => c.id !== fallbackCampaign.id)]);
      setActiveCampaignId(fallbackCampaign.id);
      setStandaloneCampaignEntry(false);
      setCurrentModule("campaign");
    }
  };

  const handleAddToConnect = () => {
    setStandaloneCampaignEntry(false);
    setCurrentModule("leads");
  };

  const isStandaloneCampaign = currentModule === "campaign" && standaloneCampaignEntry;
  const liveCampaigns = campaigns.filter((c) => c.status === "Live");
  const workspaceStatus = liveCampaigns.length
    ? `${liveCampaigns.length} live campaign${liveCampaigns.length === 1 ? "" : "s"}`
    : campaigns.length
      ? "Draft in progress"
      : "No campaign yet";

  if (loadingWorkspace || onboardingGenerating) {
    return (
      <div className={`flex min-h-screen items-center justify-center px-4 text-center text-sm text-muted ${onboardingGenerating ? "bg-canvas" : "bg-white"}`} role="status">
        {onboardingGenerating ? (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-soft text-green shadow-2xs">
            <Sparkles className="h-6 w-6 animate-pulse" />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-green border-t-transparent" />
            <span className="font-semibold text-ink">Opening LeadLens Workspace...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      {currentModule !== "lead-generation" && !isStandaloneCampaign ? (
        <AppShell
          currentModule={currentModule}
          hideSidebar={currentModule === "inbox"}
          workspaceStatus={workspaceStatus}
          onSelectModule={(mod) => {
            setStandaloneCampaignEntry(false);
            setCurrentModule(mod === "campaigns" ? "campaign" : mod);
          }}
          onSwitchToLanding={() => router.push("/")}
        >
          {onboardingError && (
            <div className="mb-6 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
              <div className="flex items-center gap-2">
                <span className="font-bold">Campaign Generation Notice:</span>
                <span>{onboardingError}</span>
              </div>
              <button
                type="button"
                onClick={() => setOnboardingError("")}
                className="font-bold hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {currentModule === "dashboard" && (
            <DashboardModule
              campaigns={campaigns}
              activeCampaignId={activeCampaignId}
              selectedLeads={campaignLaunchContext?.selectedLeads ?? []}
              connectedEmail={campaignLaunchContext?.connectedEmail}
              onNavigate={(mod) => setCurrentModule(mod === "campaigns" ? "campaign" : mod)}
              onOpenNewCampaign={() => setIsPromptOverlayOpen(true)}
              onSelectCampaign={handleSelectCampaign}
            />
          )}

          {(currentModule === "campaign" || currentModule === "campaigns") && (
            <CampaignsModule
              campaigns={campaigns}
              activeCampaignId={activeCampaignId}
              launchContext={campaignLaunchContext}
              leads={generatedLeads}
              onOpenNewCampaign={() => setIsPromptOverlayOpen(true)}
              onAddToConnect={handleAddToConnect}
              onLaunch={handleCampaignLaunched}
              onNavigate={(mod) => setCurrentModule(mod === "campaigns" ? "campaign" : mod)}
              onImportCsvLeads={handleImportCsvLeads}
              activeCampaignOnly={currentModule === "campaigns"}
            />
          )}

          {currentModule === "analytics" && (
            <AnalyticsModule
              campaigns={campaigns}
              leads={generatedLeads}
              selectedCount={campaignLaunchContext?.selectedLeadIds.length ?? 0}
            />
          )}
          {currentModule === "inbox" && (
            <InboxModule
              launched={liveCampaigns.length > 0}
              onNavigate={(mod) => setCurrentModule(mod === "campaigns" ? "campaign" : (mod as AppModule))}
              connectedEmail={campaignLaunchContext?.connectedEmail}
            />
          )}
          {currentModule === "meetings" && <MeetingsModule launched={liveCampaigns.length > 0} />}
          {currentModule === "settings" && <SettingsModule connectedEmail={campaignLaunchContext?.connectedEmail} />}

          {currentModule === "leads" && (
            <LeadsModule
              leads={generatedLeads}
              connectedEmail={campaignLaunchContext?.connectedEmail}
              initialSelectedIds={campaignLaunchContext?.selectedLeadIds}
              onSendMail={handleSendMail}
            />
          )}

          {currentModule === "email-sequence" && (
            <EmailSequenceModule
              leads={sequenceLeads}
              provider={campaignLaunchContext?.provider}
              sequence={campaigns.find((c) => c.id === activeCampaignId)?.sequence}
              onBack={() => setCurrentModule("leads")}
              onContinue={() => {
                setStandaloneCampaignEntry(false);
                setCurrentModule("campaign");
              }}
            />
          )}
        </AppShell>
      ) : null}

      {isStandaloneCampaign && (
        <AppShell
          currentModule="campaign"
          hideSidebar
          workspaceStatus={workspaceStatus}
          onSelectModule={(mod) => {
            setStandaloneCampaignEntry(false);
            setCurrentModule(mod === "campaigns" ? "campaign" : mod);
          }}
          onSwitchToLanding={() => router.push("/")}
        >
          <CampaignsModule
            campaigns={campaigns}
            activeCampaignId={activeCampaignId}
            launchContext={campaignLaunchContext}
            leads={generatedLeads}
            onOpenNewCampaign={() => setIsPromptOverlayOpen(true)}
            onAddToConnect={handleAddToConnect}
            onLaunch={handleCampaignLaunched}
            onNavigate={(mod) => setCurrentModule(mod === "campaigns" ? "campaign" : mod)}
            onImportCsvLeads={handleImportCsvLeads}
          />
        </AppShell>
      )}

      {currentModule === "lead-generation" && (
        <LeadGenerationModule
          prompt={leadGenerationPrompt}
          onConnectionComplete={handleLeadGenerationComplete}
        />
      )}

      <PromptOverlay
        key={isPromptOverlayOpen ? "prompt-open" : "prompt-closed"}
        isOpen={isPromptOverlayOpen}
        onClose={() => setIsPromptOverlayOpen(false)}
        onPromptSubmitted={handlePromptSubmitted}
      />
    </div>
  );
}
