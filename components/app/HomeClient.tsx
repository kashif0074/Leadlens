"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { AppModule, Campaign, Lead } from "../../types";
import LandingPage from "../landing/LandingPage";
import PromptOverlay from "../onboarding/PromptOverlay";
import AppShell from "../layout/AppShell";
import type { CampaignLaunchContext } from "../modules/CampaignsModule";
import type { LeadGenerationContext } from "../modules/LeadGenerationModule";

const moduleLoading = () => (
  <div className="flex min-h-48 items-center justify-center text-sm text-muted" role="status">
    Loading workspace...
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

export default function HomeClient() {
  const [viewMode, setViewMode] = useState<"landing" | "app">("landing");
  const [currentModule, setCurrentModule] = useState<AppModule>("dashboard");
  const [isPromptOverlayOpen, setIsPromptOverlayOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [campaignLaunchContext, setCampaignLaunchContext] = useState<CampaignLaunchContext | null>(null);
  const [standaloneCampaignEntry, setStandaloneCampaignEntry] = useState(false);
  const [leadGenerationPrompt, setLeadGenerationPrompt] = useState("");
  const [generatedLeads, setGeneratedLeads] = useState<Lead[]>([]);
  const [sequenceLeads, setSequenceLeads] = useState<Lead[]>([]);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("leadlens-workspace-context");
    if (!saved) {
      setRestored(true);
      return;
    }
    try {
      const context = JSON.parse(saved) as LeadGenerationContext;
      setLeadGenerationPrompt(context.prompt);
      setGeneratedLeads(context.allLeads ?? context.selectedLeads ?? []);
      setCampaignLaunchContext(context);
      setViewMode("app");
      setCurrentModule("campaign");
      setStandaloneCampaignEntry(true);
    } catch {
      window.localStorage.removeItem("leadlens-workspace-context");
    } finally {
      setRestored(true);
    }
  }, []);

  const handlePromptSubmitted = (prompt: string) => {
    setLeadGenerationPrompt(prompt);
    setViewMode("app");
    setCurrentModule("lead-generation");
    setStandaloneCampaignEntry(false);
  };

  const handleLeadGenerationComplete = (context: LeadGenerationContext) => {
    window.localStorage.setItem("leadlens-workspace-context", JSON.stringify(context));
    setGeneratedLeads(context.allLeads);
    const newCampaign: Campaign = {
      id: `camp-${Date.now()}`,
      name: campaignNameFromBrief(context.prompt),
      brief: context.prompt,
      status: "Ready",
      leadsCount: context.allLeads.length,
      sentCount: 0,
      replyRate: 0,
      sequence: [
        {
          step: 1,
          delayDays: 0,
          subject: "Quick question regarding {{company}}",
          body: "Hi {{first_name}},\n\nI noticed {{company}}'s recent expansion. We help teams book qualified conversations with a considerate cadence.\n\nWorth a brief introduction?",
        },
        {
          step: 2,
          delayDays: 3,
          subject: "Re: Quick question regarding {{company}}",
          body: "Hi {{first_name}},\n\nFollowing up on my earlier note. Open to a short walkthrough?",
        },
      ],
    };
    setCampaigns((current) => [newCampaign, ...current.filter((campaign) => campaign.id !== newCampaign.id)]);
    setActiveCampaignId(newCampaign.id);
    setCampaignLaunchContext(context);
    setStandaloneCampaignEntry(true);
    setCurrentModule("campaign");
  };

  const handleCampaignLaunched = (payload: { selectedLeadIds: string[]; connectedEmail: string; provider: string }) => {
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

  const handleSendMail = (selectedLeads: Lead[]) => {
    setSequenceLeads(selectedLeads);
    setCurrentModule("email-sequence");
  };

  const isStandaloneCampaign = currentModule === "campaign" && standaloneCampaignEntry;
  const liveCampaigns = campaigns.filter((campaign) => campaign.status === "Live");
  const workspaceStatus = liveCampaigns.length
    ? `${liveCampaigns.length} live campaign${liveCampaigns.length === 1 ? "" : "s"}`
    : campaigns.length
      ? "Draft in progress"
      : "No campaign yet";

  if (!restored) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted" role="status">
        Loading LeadLens...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      {viewMode === "landing" ? (
        <LandingPage
          onStartCampaign={() => setIsPromptOverlayOpen(true)}
          onEnterApp={() => {
            setViewMode("app");
            setCurrentModule("dashboard");
            setStandaloneCampaignEntry(false);
          }}
        />
      ) : currentModule !== "lead-generation" && !isStandaloneCampaign ? (
        <AppShell
          currentModule={currentModule}
          hideSidebar={false}
          workspaceStatus={workspaceStatus}
          onSelectModule={(mod) => {
            setStandaloneCampaignEntry(false);
            setCurrentModule(mod === "campaigns" ? "campaign" : mod);
          }}
          onOpenPrompt={() => setIsPromptOverlayOpen(true)}
          onSwitchToLanding={() => setViewMode("landing")}
        >
          {currentModule === "dashboard" && (
            <DashboardModule
              campaigns={campaigns}
              activeCampaignId={activeCampaignId}
              selectedLeads={campaignLaunchContext?.selectedLeads ?? []}
              connectedEmail={campaignLaunchContext?.connectedEmail}
              onNavigate={(mod) => setCurrentModule(mod === "campaigns" ? "campaign" : mod)}
              onOpenNewCampaign={() => setIsPromptOverlayOpen(true)}
            />
          )}

          {(currentModule === "campaign" || currentModule === "campaigns") && (
            <CampaignsModule
              campaigns={campaigns}
              activeCampaignId={activeCampaignId}
              launchContext={campaignLaunchContext}
              leads={generatedLeads}
              onOpenNewCampaign={() => setIsPromptOverlayOpen(true)}
              onLaunch={handleCampaignLaunched}
            />
          )}

          {currentModule === "email-sequence" && (
            <EmailSequenceModule
              leads={sequenceLeads}
              provider={campaignLaunchContext?.provider}
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
            <AnalyticsModule campaigns={campaigns} leads={generatedLeads} selectedCount={campaignLaunchContext?.selectedLeadIds.length ?? 0} />
          )}
          {currentModule === "settings" && <SettingsModule connectedEmail={campaignLaunchContext?.connectedEmail} />}

          {currentModule === "leads" && (
            <LeadsModule
              leads={generatedLeads}
              connectedEmail={campaignLaunchContext?.connectedEmail}
              onSendMail={handleSendMail}
            />
          )}
        </AppShell>
      ) : null}

      {viewMode === "app" && isStandaloneCampaign && (
        <AppShell
          currentModule="campaign"
          hideSidebar
          workspaceStatus={workspaceStatus}
          onSelectModule={(mod) => {
            setStandaloneCampaignEntry(false);
            setCurrentModule(mod === "campaigns" ? "campaign" : mod);
          }}
          onOpenPrompt={() => setIsPromptOverlayOpen(true)}
          onSwitchToLanding={() => setViewMode("landing")}
        >
          <CampaignsModule
            campaigns={campaigns}
            activeCampaignId={activeCampaignId}
            launchContext={campaignLaunchContext}
            leads={generatedLeads}
            onOpenNewCampaign={() => setIsPromptOverlayOpen(true)}
            onLaunch={handleCampaignLaunched}
          />
        </AppShell>
      )}

      {viewMode === "app" && currentModule === "lead-generation" && (
        <LeadGenerationModule prompt={leadGenerationPrompt} onConnectionComplete={handleLeadGenerationComplete} />
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
