"use client";

import { BarChart3, CheckCircle2, Mail, Send, ShieldAlert, Users } from "lucide-react";
import type { Campaign, Lead } from "../../types";

interface AnalyticsModuleProps {
  campaigns: Campaign[];
  leads: Lead[];
  selectedCount: number;
}

export default function AnalyticsModule({ campaigns, leads, selectedCount }: AnalyticsModuleProps) {
  const activeCampaign =
    campaigns.find((item) => item.status === "Live") ??
    campaigns.find((item) => item.status === "Partially sent") ??
    campaigns[0];

  const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);
  const totalFailed = campaigns.reduce((acc, c) => acc + (c.failedCount || 0), 0);
  const replies = activeCampaign?.replyRate ?? 0;
  const isLive = activeCampaign?.status === "Live" || activeCampaign?.status === "Partially sent";

  const stages = [
    { label: "Campaign brief defined", value: activeCampaign ? 100 : 0 },
    { label: "Leads sourced and reviewed", value: leads.length ? 100 : 0 },
    { label: "Audience selected", value: selectedCount ? 100 : 0 },
    { label: "Campaign launched", value: isLive ? 100 : 0 },
    {
      label: "Emails sent",
      value: activeCampaign?.leadsCount
        ? Math.min(100, Math.round(((activeCampaign.sentCount || 0) / activeCampaign.leadsCount) * 100))
        : 0,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <p className="eyebrow">Performance</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Analytics</h1>
        <p className="mt-2 text-sm text-muted">Counts reflect Gmail SMTP acceptance, not confirmed inbox placement.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Loaded leads" value={String(leads.length)} detail="Available in workspace" />
        <Metric
          icon={Send}
          label="Accepted by Gmail"
          value={String(totalSent)}
          detail={
            totalFailed > 0
              ? `${totalFailed} failed sends`
              : isLive
                ? "Accepted by Gmail SMTP"
                : "No sends yet"
          }
        />
        <Metric icon={Mail} label="Reply rate" value={`${replies}%`} detail="Updates after real replies" />
        <Metric icon={BarChart3} label="Meetings booked" value="0" detail="No meetings recorded yet" />
      </section>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="surface rounded-3xl p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Conversion path</p>
              <h2 className="mt-2 text-xl font-bold">{activeCampaign?.name ?? "No campaign yet"}</h2>
            </div>
            <span
              className={`status ${
                activeCampaign?.status === "Live"
                  ? "good"
                  : activeCampaign?.status === "Partially sent"
                    ? "good"
                    : activeCampaign?.status === "Failed"
                      ? "bad"
                      : "warn"
              }`}
            >
              {activeCampaign?.status ?? "Idle"}
            </span>
          </div>
          <div className="mt-6 space-y-5">
            {stages.map((stage) => (
              <div key={stage.label}>
                <div className="mb-2 flex justify-between gap-3 text-sm font-semibold">
                  <span>{stage.label}</span>
                  <span className="text-green">{stage.value}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-mist">
                  <div className="h-full rounded-full bg-green" style={{ width: `${stage.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="surface rounded-3xl p-6">
          <p className="eyebrow">Campaign health</p>
          <h2 className="mt-2 text-xl font-bold">Workspace snapshot</h2>
          <div className="mt-5 space-y-3">
            <Health label="Loaded leads" value={String(leads.length)} />
            <Health label="Selected audience" value={String(selectedCount)} />
            <Health
              label="Delivery status"
              value={
                activeCampaign?.sentCount
                  ? `${activeCampaign.sentCount} sent${activeCampaign.failedCount ? ` · ${activeCampaign.failedCount} failed` : ""}`
                  : "Ready to launch"
              }
            />
            <Health label="Inbox warmup" value={isLive ? "Confirmed at launch" : "In setup"} />
          </div>
          {totalFailed > 0 ? (
            <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <span>Some emails encountered delivery issues. Review failed contacts in Campaign Setup.</span>
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-green-soft p-4 text-sm text-green-dark">
              <CheckCircle2 className="mr-2 inline h-4 w-4" />
              Analytics track real SMTP email deliveries and confirmed responses.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) {
  return (
    <div className="surface rounded-2xl p-5">
      <Icon className="h-5 w-5 text-green" />
      <span className="mt-4 block text-xs font-semibold text-muted">{label}</span>
      <strong className="mt-1 block text-3xl">{value}</strong>
      <span className="mt-1 block text-xs text-muted">{detail}</span>
    </div>
  );
}

function Health({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-canvas p-3 text-sm">
      <span>{label}</span>
      <strong className="text-green">{value}</strong>
    </div>
  );
}
