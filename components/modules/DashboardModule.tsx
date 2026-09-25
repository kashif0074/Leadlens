"use client";

import { ArrowRight, CalendarCheck, Mail, Rocket, ShieldCheck, Users } from "lucide-react";
import type { AppModule, Campaign, Lead } from "../../types";

interface DashboardModuleProps {
  campaigns: Campaign[];
  activeCampaignId: string;
  selectedLeads: Lead[];
  connectedEmail?: string;
  onNavigate: (module: AppModule) => void;
  onOpenNewCampaign: () => void;
  onSelectCampaign?: (campaignId: string) => void;
}

export default function DashboardModule({
  campaigns,
  activeCampaignId,
  selectedLeads,
  connectedEmail,
  onNavigate,
  onOpenNewCampaign,
  onSelectCampaign,
}: DashboardModuleProps) {
  const activeCampaign = campaigns.find((campaign) => campaign.id === activeCampaignId) ?? campaigns[0];
  const liveCampaigns = campaigns.filter((campaign) => campaign.status === "Live");
  const activeCampaignIsLive = activeCampaign?.status === "Live";
  const selectedCount = selectedLeads.length;
  const workflowPercent = activeCampaignIsLive ? 100 : selectedCount > 0 && connectedEmail ? 75 : selectedCount > 0 ? 45 : campaigns.length ? 20 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">LeadLens command center</p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-ink">Keep every campaign decision intentional.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Monitor audience selection, sending readiness, and live campaigns from this workspace.
          </p>
        </div>
        <button type="button" className="btn btn-primary self-start sm:self-auto" onClick={onOpenNewCampaign}>
          <Rocket className="h-4 w-4" /> New campaign
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Live campaigns" value={String(liveCampaigns.length)} detail={`${campaigns.length} total in workspace`} icon={Rocket} />
        <MetricCard label="Selected leads" value={String(selectedCount)} detail={selectedCount ? "Included in the active campaign" : "No leads selected yet"} icon={Users} />
        <MetricCard label="Emails sent" value={String(activeCampaign?.sentCount ?? 0)} detail={activeCampaignIsLive ? "Tracked after sends begin" : "No sends yet"} icon={Mail} />
        <MetricCard label="Meetings booked" value="0" detail="Meetings appear after confirmed replies" icon={CalendarCheck} />
      </section>

      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <div className="surface overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between gap-4 bg-green-dark px-6 py-4 text-white">
            <div>
              <p className="text-xs font-semibold tracking-wider text-green-soft uppercase">Current campaign</p>
              <h2 className="mt-1 text-lg font-bold">{activeCampaign?.name ?? "No campaign started"}</h2>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-soft">
              <span className={`h-2 w-2 rounded-full ${activeCampaignIsLive ? "bg-green-300" : "bg-gold"}`} />
              {activeCampaignIsLive ? "Live" : activeCampaign ? "In setup" : "Idle"}
            </span>
          </div>
          <div className="space-y-6 p-6 sm:p-8">
            {activeCampaign ? (
              <>
                <div>
                  <p className="text-xs font-semibold tracking-wider text-muted uppercase">Campaign brief</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{activeCampaign.brief}</p>
                </div>
                <div>
                  <div className="mb-2 flex justify-between gap-3 text-xs font-semibold">
                    <span>Workflow readiness</span>
                    <span className="text-green">{workflowPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-mist">
                    <div className="h-full rounded-full bg-green" style={{ width: `${workflowPercent}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between gap-3 text-xs text-muted">
                    <span>{activeCampaignIsLive ? "Campaign is live in this workspace" : "Continue setup to launch"}</span>
                    <span>
                      {selectedCount} selected · {activeCampaign.leadsCount} campaign leads
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => onNavigate(activeCampaignIsLive ? "leads" : "campaign")}>
                    {activeCampaignIsLive ? "Open leads" : "Continue campaign setup"} <ArrowRight className="h-4 w-4" />
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => onNavigate("campaign")}>
                    Open campaign
                  </button>
                </div>
              </>
            ) : (
              <EmptyDashboardState onStart={onOpenNewCampaign} />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <section className="surface rounded-3xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Sending readiness</p>
                <h2 className="mt-2 text-lg font-bold">{connectedEmail ? "Inbox saved" : "Inbox not saved"}</h2>
              </div>
              <ShieldCheck className={`h-6 w-6 ${connectedEmail ? "text-green" : "text-gold"}`} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {connectedEmail
                ? `${connectedEmail} is saved on the active campaign.`
                : "Save a sending inbox during campaign setup before launch."}
            </p>
            <button type="button" className="btn btn-secondary mt-5 w-full" onClick={() => onNavigate("campaign")}>
              {connectedEmail ? "Review sending setup" : "Open campaign setup"} <ArrowRight className="h-4 w-4" />
            </button>
          </section>

          <section className="surface rounded-3xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Inbox</p>
                <h2 className="mt-2 text-lg font-bold">No replies yet</h2>
              </div>
              <span className="status warn">Waiting</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Replies will appear here after a live campaign starts receiving responses.
            </p>
            <button type="button" className="btn btn-secondary mt-5 w-full" onClick={() => onNavigate("inbox")}>
              Open inbox <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        </div>
      </section>

      <section className="surface rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Campaign portfolio</p>
            <h2 className="mt-2 font-serif text-xl font-bold">Your campaigns</h2>
          </div>
          <button type="button" className="text-xs font-bold text-green hover:underline" onClick={() => onNavigate("campaign")}>
            View campaign setup <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
          </button>
        </div>
        {campaigns.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => {
                  onSelectCampaign?.(campaign.id);
                  onNavigate("campaign");
                }}
                className={`rounded-2xl border p-4 text-left transition-colors cursor-pointer ${
                  campaign.id === activeCampaignId
                    ? "border-green bg-green-soft/30 shadow-xs"
                    : "border-line bg-canvas hover:border-green"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-ink">{campaign.name}</span>
                  <span className={`status ${campaign.status === "Live" ? "good" : "warn"}`}>{campaign.status}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{campaign.brief}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-muted">
                  <span>{campaign.leadsCount} leads</span>
                  <span>
                    {campaign.sentCount} sent · {campaign.replyRate}% replies
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-canvas p-5 text-sm text-muted">No campaigns yet. Start from a campaign brief to populate this list.</p>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Users }) {
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <Icon className="h-4 w-4 text-green" />
      </div>
      <strong className="mt-3 block text-3xl font-bold text-ink">{value}</strong>
      <span className="mt-1 block text-xs text-muted">{detail}</span>
    </div>
  );
}

function EmptyDashboardState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-2xl bg-mist p-5">
      <p className="font-bold">Start your first campaign</p>
      <p className="mt-1 text-sm text-muted">Describe your offer. LeadLens will take you through leads, inbox details, and launch.</p>
      <button type="button" className="btn btn-primary mt-4" onClick={onStart}>
        Create campaign <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
