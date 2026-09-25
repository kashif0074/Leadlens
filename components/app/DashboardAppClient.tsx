"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { AppModule, Campaign, Lead } from "../../types";
import PromptOverlay from "../onboarding/PromptOverlay";
import AppShell from "../layout/AppShell";
import type { CampaignLaunchContext } from "../modules/CampaignsModule";
import type { LeadGenerationContext } from "../modules/LeadGenerationModule";
import { generatedLeadPool } from "../../lib/leads";

const moduleLoading = () => (
  <div className="flex min-h-48 items-center justify-center text-sm text-muted" role="status">
    Loading workspace module...
  </div>
);

const DashboardModule = dynamic(() => import("../modules/DashboardModule"), { loading: moduleLoading });
const CampaignsModule = dynamic(() => import("../modules/CampaignsModule"), { loading: moduleLoading });
const LeadsModule = dynamic(() => import("../modules/LeadsModule"), { loading: moduleLoading });
const InboxModule = dynamic(() => import("../modules/InboxModule"), { loading: moduleLoading });
const MeetingsModule = dynamic(() => import("../modules/MeetingsModule"), { loading: moduleLoading });
const AnalyticsModule = dynamic(() => import("../modules/AnalyticsModule"), { loading: moduleLoading });
const SettingsModule = dynamic(() => import("../modules/SettingsModule"), { loading: moduleLoading });
const LeadGenerationModule = dynamic(() => import("../modules/LeadGenerationModule"), { loading: moduleLoading });
const EmailSequenceModule = dynamic(() => import("../modules/EmailSequenceModule"), { loading: moduleLoading });

function campaignNameFromBrief(brief: string) {
  const compact = brief.trim().replace(/\s+/g, " ");
  return compact.length > 48 ? `${compact.slice(0, 48)}…` : compact || "Outbound campaign";
}

export default function DashboardAppClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentModule, setCurrentModule] = useState<AppModule>("dashboard");
  const [isPromptOverlayOpen, setIsPromptOverlayOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [campaignLaunchContext, setCampaignLaunchContext] = useState<CampaignLaunchContext | null>(null);
  const [standaloneCampaignEntry, setStandaloneCampaignEntry] = useState(false);
  const [leadGenerationPrompt, setLeadGenerationPrompt] = useState("");
  const [generatedLeads, setGeneratedLeads] = useState<Lead[]>(() => generatedLeadPool);
  const [sequenceLeads, setSequenceLeads] = useState<Lead[]>([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [onboardingGenerating, setOnboardingGenerating] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const hasProcessedPendingOnboarding = useRef(false);

  // Check query params on mount
  useEffect(() => {
    if (searchParams.get("action") === "new-campaign") {
      setIsPromptOverlayOpen(true);
    }
  }, [searchParams]);

  // Load saved context inside dashboard workspace
  useEffect(() => {
    const saved = window.localStorage.getItem("leadlens-workspace-context");
    if (saved) {
      try {
        const context = JSON.parse(saved) as LeadGenerationContext;
        setLeadGenerationPrompt(context.prompt);
        setGeneratedLeads(context.allLeads ?? context.selectedLeads ?? []);
        setCampaignLaunchContext(context);
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
    if (hasProcessedPendingOnboarding.current) return;

    const pending = window.localStorage.getItem("leadlens-pending-onboarding");
    if (pending) {
      hasProcessedPendingOnboarding.current = true;
      try {
        const pendingContext = JSON.parse(pending) as {
          prompt: string;
          selectedLeadIds: string[];
          selectedLeads: Lead[];
          allLeads: Lead[];
        };
        window.localStorage.removeItem("leadlens-pending-onboarding");

        setOnboardingGenerating(true);
        setOnboardingError("");
        handleLeadGenerationComplete({
          prompt: pendingContext.prompt,
          selectedLeadIds: pendingContext.selectedLeadIds,
          selectedLeads: pendingContext.selectedLeads,
          allLeads: pendingContext.allLeads,
          connectedEmail: "",
          provider: "Google Workspace / Gmail",
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
      } catch {
        window.localStorage.removeItem("leadlens-pending-onboarding");
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
  }, []);

  const handlePromptSubmitted = (prompt: string) => {
    setLeadGenerationPrompt(prompt);
    setCurrentModule("lead-generation");
    setStandaloneCampaignEntry(false);
  };

  const handleCampaignLaunched = async (payload: {
    selectedLeadIds: string[];
    connectedEmail: string;
    provider: string;
  }) => {
    if (activeCampaignId) {
      const response = await fetch("/api/campaigns/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: activeCampaignId,
          sequence: campaigns.find((c) => c.id === activeCampaignId)?.sequence,
          selectedLeadIds: payload.selectedLeadIds,
          connectedEmail: payload.connectedEmail,
          provider: payload.provider,
          status: "Live",
        }),
      });

      if (!response.ok) throw new Error("Unable to save campaign launch settings.");
    }

    const selectedLeads = generatedLeads.filter((lead) => payload.selectedLeadIds.includes(lead.id));

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
              status: "Live",
              leadsCount: payload.selectedLeadIds.length,
              sentCount: 0,
              replyRate: 0,
            }
          : campaign,
      ),
    );

    setStandaloneCampaignEntry(false);
    setCurrentModule("dashboard");
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center text-sm text-muted" role="status">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-green border-t-transparent" />
          <span className="font-semibold text-ink">
            {onboardingGenerating ? "Generating personalized emails with Groq AI..." : "Opening LeadLens Workspace..."}
          </span>
        </div>
        {onboardingGenerating && (
          <p className="mt-2 text-xs text-muted max-w-sm">
            Unlocking your audience and personalizing your 3-step outreach sequence...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      {currentModule !== "lead-generation" && !isStandaloneCampaign ? (
        <AppShell
          currentModule={currentModule}
          hideSidebar={false}
          workspaceStatus={workspaceStatus}
          onSelectModule={(mod) => {
            setStandaloneCampaignEntry(false);
            setCurrentModule(mod === "campaigns" ? "campaign" : mod);
          }}
          onOpenPrompt={() => setIsPromptOverlayOpen(true)}
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

          {currentModule === "inbox" && <InboxModule launched={liveCampaigns.length > 0} />}
          {currentModule === "meetings" && <MeetingsModule launched={liveCampaigns.length > 0} />}
          {currentModule === "analytics" && (
            <AnalyticsModule
              campaigns={campaigns}
              leads={generatedLeads}
              selectedCount={campaignLaunchContext?.selectedLeadIds.length ?? 0}
            />
          )}
          {currentModule === "settings" && (
            <SettingsModule connectedEmail={campaignLaunchContext?.connectedEmail} />
          )}

          {currentModule === "leads" && (
            <LeadsModule
              leads={generatedLeads}
              connectedEmail={campaignLaunchContext?.connectedEmail}
              initialSelectedIds={campaignLaunchContext?.selectedLeadIds}
              onSendMail={handleSendMail}
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
          onOpenPrompt={() => setIsPromptOverlayOpen(true)}
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
