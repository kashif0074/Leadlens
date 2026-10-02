"use client";

import { useState } from "react";
import {
  BarChart2,
  CheckCircle2,
  Mail,
  Send,
  Users,
  ShieldCheck,
  TrendingUp,
  Building2,
  Briefcase,
  AlertCircle,
  Layers,
} from "lucide-react";
import type { Campaign, Lead } from "../../types";

interface AnalyticsModuleProps {
  campaigns: Campaign[];
  leads: Lead[];
  selectedCount: number;
}

export default function AnalyticsModule({ campaigns, leads, selectedCount }: AnalyticsModuleProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(
    campaigns.find((c) => c.status === "Live" || c.status === "Partially sent")?.id ||
    campaigns[0]?.id ||
    ""
  );

  const activeCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? campaigns[0];

  // Totals across workspace
  const totalSent = campaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);
  const totalFailed = campaigns.reduce((acc, c) => acc + (c.failedCount || 0), 0);
  const totalLeadsInCampaigns = campaigns.reduce((acc, c) => acc + (c.leadsCount || 0), 0);
  const liveCampaignsCount = campaigns.filter(
    (c) => c.status === "Live" || c.status === "Partially sent"
  ).length;

  const totalAttempts = totalSent + totalFailed;
  const deliverySuccessRate = totalAttempts > 0 ? Math.round((totalSent / totalAttempts) * 100) : 100;
  const replyRate = activeCampaign?.replyRate ?? 0;

  // Lead Demographics & Verification Analysis
  const totalLeads = leads.length;
  const verifiedLeads = leads.filter((l) => l.verificationTag === "Email verified").length;
  const enrichedLeads = leads.filter((l) => l.verificationTag === "Enriched").length;
  const reviewLeads = leads.filter((l) => l.verificationTag === "Review contact").length;

  const verifiedPercent = totalLeads ? Math.round((verifiedLeads / totalLeads) * 100) : 0;
  const enrichedPercent = totalLeads ? Math.round((enrichedLeads / totalLeads) * 100) : 0;
  const reviewPercent = totalLeads ? Math.round((reviewLeads / totalLeads) * 100) : 0;

  // Role Breakdown
  const roles = {
    Executive: leads.filter((l) => l.role === "Executive").length,
    Director: leads.filter((l) => l.role === "Director").length,
    Manager: leads.filter((l) => l.role === "Manager").length,
    "Individual Contributor": leads.filter((l) => l.role === "Individual Contributor").length,
  };

  // Top Industries
  const industryCounts: Record<string, number> = {};
  leads.forEach((l) => {
    if (l.industry) {
      industryCounts[l.industry] = (industryCounts[l.industry] || 0) + 1;
    }
  });
  const topIndustries = Object.entries(industryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  // Active Campaign Funnel Stages
  const campaignLeadsCount = activeCampaign?.leadsCount || activeCampaign?.selectedLeadIds?.length || 0;
  const campaignSentCount = activeCampaign?.sentCount || 0;
  const campaignSentPercent = campaignLeadsCount > 0 ? Math.min(100, Math.round((campaignSentCount / campaignLeadsCount) * 100)) : 0;

  const funnelStages = [
    {
      label: "Audience Sourced",
      count: totalLeads,
      percentage: totalLeads > 0 ? 100 : 0,
      description: "Total prospects in database",
    },
    {
      label: "Campaign Target List",
      count: campaignLeadsCount || selectedCount,
      percentage: totalLeads > 0 ? Math.round(((campaignLeadsCount || selectedCount) / totalLeads) * 100) : 0,
      description: "Selected for outreach",
    },
    {
      label: "Outreach Delivered",
      count: campaignSentCount,
      percentage: campaignSentPercent,
      description: "Delivered to recipient inboxes",
    },
    {
      label: "Responses Received",
      count: replyRate > 0 ? Math.max(1, Math.round((campaignSentCount * replyRate) / 100)) : 0,
      percentage: replyRate,
      description: `${replyRate}% response rate recorded`,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 pb-12">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Performance & Reporting</p>
          <h1 className="mt-1 font-serif text-3xl font-bold text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-muted">
            Monitor email delivery metrics, campaign responses, and prospect audience insights.
          </p>
        </div>

        {campaigns.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">Campaign:</span>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="input text-xs py-2 px-3 max-w-xs font-medium"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName || c.name || "Untitled Campaign"}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* Top 4 KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Users}
          label="Total Prospects"
          value={String(totalLeads)}
          detail={`${verifiedLeads} verified contacts`}
          badge="Workspace"
        />
        <MetricCard
          icon={Send}
          label="Emails Delivered"
          value={String(totalSent)}
          detail={totalFailed > 0 ? `${totalFailed} failed attempts` : "100% delivered successfully"}
          badge={`${deliverySuccessRate}% success`}
        />
        <MetricCard
          icon={Layers}
          label="Active Campaigns"
          value={String(liveCampaignsCount)}
          detail={`${campaigns.length} total campaigns created`}
          badge={liveCampaignsCount > 0 ? "Running" : "Idle"}
        />
        <MetricCard
          icon={Mail}
          label="Reply Rate"
          value={`${replyRate}%`}
          detail={activeCampaign ? activeCampaign.displayName || activeCampaign.name : "Across campaigns"}
          badge="Live responses"
        />
      </section>

      {/* Main Analytics Grid */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        {/* Left Column: Campaign Performance & Outreach Funnel */}
        <div className="space-y-6">
          {/* Outreach Conversion Funnel */}
          <section className="surface rounded-3xl p-6 sm:p-7 border border-line bg-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <p className="eyebrow">Outreach Pipeline</p>
                <h2 className="mt-1 text-lg font-bold text-ink">
                  {activeCampaign?.displayName || activeCampaign?.name || "Campaign Funnel"}
                </h2>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  activeCampaign?.status === "Live" || activeCampaign?.status === "Partially sent"
                    ? "bg-green-soft text-green-dark"
                    : activeCampaign?.status === "Failed"
                    ? "bg-red-50 text-red-700"
                    : "bg-gold-soft text-gold"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    activeCampaign?.status === "Live" || activeCampaign?.status === "Partially sent"
                      ? "bg-green animate-pulse"
                      : activeCampaign?.status === "Failed"
                      ? "bg-red-500"
                      : "bg-gold"
                  }`}
                />
                {activeCampaign?.status || "Idle"}
              </span>
            </div>

            <div className="mt-6 space-y-5">
              {funnelStages.map((stage, idx) => (
                <div key={stage.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-mist text-[11px] font-bold text-muted">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-ink">{stage.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{stage.count}</span>
                      <span className="text-xs font-semibold text-green">({stage.percentage}%)</span>
                    </div>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-mist">
                    <div
                      className="h-full rounded-full bg-green transition-all duration-500"
                      style={{ width: `${Math.max(3, stage.percentage)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted">{stage.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Audience Breakdown & Contact Quality */}
        <div className="space-y-6">
          {/* Contact Verification Quality */}
          <section className="surface rounded-3xl p-6 sm:p-7 border border-line bg-white shadow-xs">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">Audience Quality</p>
              <h2 className="mt-1 text-lg font-bold text-ink">Email Verification</h2>
            </div>

            <div className="mt-5 space-y-4">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-mist">
                <div
                  className="bg-green transition-all"
                  style={{ width: `${verifiedPercent}%` }}
                  title={`Verified: ${verifiedPercent}%`}
                />
                <div
                  className="bg-teal-400 transition-all"
                  style={{ width: `${enrichedPercent}%` }}
                  title={`Enriched: ${enrichedPercent}%`}
                />
                <div
                  className="bg-amber-400 transition-all"
                  style={{ width: `${reviewPercent}%` }}
                  title={`Review: ${reviewPercent}%`}
                />
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-green" />
                    <span className="font-semibold text-ink">Verified Emails</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{verifiedLeads}</span>
                    <span className="text-muted">({verifiedPercent}%)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
                    <span className="font-semibold text-ink">Enriched Contacts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{enrichedLeads}</span>
                    <span className="text-muted">({enrichedPercent}%)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="font-semibold text-ink">Under Review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{reviewLeads}</span>
                    <span className="text-muted">({reviewPercent}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Decision Maker Distribution */}
          <section className="surface rounded-3xl p-6 sm:p-7 border border-line bg-white shadow-xs">
            <div className="border-b border-line pb-4">
              <p className="eyebrow">Demographics</p>
              <h2 className="mt-1 text-lg font-bold text-ink">Seniority Level</h2>
            </div>

            <div className="mt-5 space-y-3.5">
              {Object.entries(roles).map(([roleName, count]) => {
                const percent = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
                return (
                  <div key={roleName} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-ink">{roleName}</span>
                      <span className="text-muted">
                        {count} <span className="text-green font-bold">({percent}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-mist">
                      <div
                        className="h-full rounded-full bg-green"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Top Target Industries */}
          {topIndustries.length > 0 && (
            <section className="surface rounded-3xl p-6 sm:p-7 border border-line bg-white shadow-xs">
              <div className="border-b border-line pb-4">
                <p className="eyebrow">Target Markets</p>
                <h2 className="mt-1 text-lg font-bold text-ink">Top Industries</h2>
              </div>

              <div className="mt-4 divide-y divide-line/60">
                {topIndustries.map(([industry, count]) => (
                  <div key={industry} className="flex items-center justify-between py-2.5 text-xs">
                    <span className="font-semibold text-ink truncate max-w-[200px]">{industry}</span>
                    <span className="rounded-full bg-green-soft px-2.5 py-0.5 font-bold text-green-dark">
                      {count} prospects
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  badge?: string;
}) {
  return (
    <div className="surface rounded-3xl p-6 border border-line bg-white shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-soft text-green">
          <Icon className="h-5 w-5" />
        </div>
        {badge && (
          <span className="rounded-full bg-mist px-2.5 py-0.5 text-[11px] font-bold text-muted">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-5">
        <span className="block text-xs font-semibold text-muted uppercase tracking-wider">{label}</span>
        <p className="mt-1 text-3xl font-bold tracking-tight text-ink">{value}</p>
        <span className="mt-1.5 block text-xs text-muted">{detail}</span>
      </div>
    </div>
  );
}
