"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Mail, Pencil, Server, Send, X } from "lucide-react";
import type { Campaign, Lead, SetupStep } from "../../types";
import LeadManagementView from "../leads/LeadManagementView";

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
  onLaunch: (payload: { selectedLeadIds: string[]; connectedEmail: string; provider: string }) => Promise<void>;
}

const steps = ["Leads", "Send emails", "Connect inbox", "Sending", "Warmup", "Review", "Launch"];
const providers = [
  { name: "Google Workspace / Gmail", description: "Use a managed Google inbox for this campaign.", icon: Mail },
  { name: "Microsoft Outlook / Microsoft 365", description: "Use an organization inbox for this campaign.", icon: Send },
  { name: "Other email provider", description: "Use SMTP or another provider you already manage.", icon: Server },
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type CampaignEmail = Campaign["sequence"][number];

function createEmailSequence(campaign?: Campaign): CampaignEmail[] {
  const saved = campaign?.sequence ?? [];
  return Array.isArray(saved) && saved.length > 0
    ? saved.map((email, index) => ({ ...email, step: index + 1 }))
    : [];
}

export default function CampaignsModule({
  campaigns = [],
  activeCampaignId,
  launchContext,
  leads,
  onOpenNewCampaign,
  onAddToConnect,
  onLaunch,
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
  const [provider, setProvider] = useState(launchContext?.provider ?? campaign?.provider ?? "");
  const [email, setEmail] = useState(launchContext?.connectedEmail ?? campaign?.connectedEmail ?? "");
  const [providerModal, setProviderModal] = useState<string | null>(null);
  const [sendingSaved, setSendingSaved] = useState(() => campaign?.status === "Live");
  const [warmupAcknowledged, setWarmupAcknowledged] = useState(() => campaign?.status === "Live");
  const [toast, setToast] = useState("");
  const [launchError, setLaunchError] = useState("");
  const [emailSequence, setEmailSequence] = useState<CampaignEmail[]>(() => createEmailSequence(campaign));
  const [editingEmail, setEditingEmail] = useState<number | null>(null);
  const [regenerationPrompt, setRegenerationPrompt] = useState("");
  const [pendingSequence, setPendingSequence] = useState<CampaignEmail[] | null>(null);
  const [pendingPersonalizedEmails, setPendingPersonalizedEmails] = useState<Campaign["personalizedEmails"]>();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");

  useEffect(() => {
    const syncContext = window.setTimeout(() => {
      if (launchContext?.selectedLeadIds?.length) {
        setSelectedIds(new Set(launchContext.selectedLeadIds));
      }
      if (launchContext?.connectedEmail) setEmail(launchContext.connectedEmail);
      if (launchContext?.provider) setProvider(launchContext.provider);
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
    if (campaign?.connectedEmail && !launchContext?.connectedEmail) {
      setEmail(campaign.connectedEmail);
    }
    if (campaign?.provider && !launchContext?.provider) {
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
  const launched = campaign?.status === "Live";

  const connectProvider = () => {
    if (!emailPattern.test(email.trim())) {
      notify("Enter a valid sending email before continuing.");
      return;
    }
    setProvider(providerModal ?? "");
    setProviderModal(null);
    notify("Sending email saved for this campaign.");
  };

  const goTo = (next: SetupStep) => {
    if (next >= 1 && selectedIds.size === 0) {
      notify("Select at least one lead before continuing.");
      return;
    }
    if (next >= 3 && !emailPattern.test(email)) {
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
      await onLaunch({
        selectedLeadIds: Array.from(selectedIds),
        connectedEmail: email.trim(),
        provider,
      });
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Unable to launch campaign.");
    }
  };

  const saveEmailSequence = async (next: CampaignEmail[], personalizedEmails = campaign?.personalizedEmails) => {
    setEmailSequence(next);
    if (!campaign?.id) return;
    try {
      const response = await fetch("/api/campaigns/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, sequence: next, personalizedEmails, selectedLeadIds: Array.from(selectedIds), connectedEmail: email.trim(), provider }),
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
        body: JSON.stringify({ campaignId: campaign.id, prompt: brief, name: activeCampaignName, selectedLeadIds: Array.from(selectedIds), selectedLeads, instruction, currentSequence: emailSequence, preview: true }),
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

  if (!campaign && effectiveLeads.length === 0) {
    return (
      <div className="surface panel max-w-3xl">
        <p className="eyebrow">Campaigns</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">No campaign started yet.</h1>
        <p className="mt-2 text-sm text-muted">
          Describe your offer to generate matching leads, then set up and launch a campaign from this workspace.
        </p>
        <button type="button" className="btn btn-primary mt-6" onClick={onOpenNewCampaign}>
          Create campaign
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.13em] text-green uppercase">Campaign workspace</p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-ink">{activeCampaignName}</h1>
          {brief && <p className="mt-2 max-w-3xl text-sm text-muted">Built around your brief: “{brief}”</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${launched ? "bg-green-soft text-green" : "bg-gold-soft text-gold"}`}>
            {launched ? "Campaign live" : campaign?.status ?? "Draft"}
          </span>
          <button className="btn btn-primary text-xs" type="button" onClick={onOpenNewCampaign}>
            New campaign
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
          <div className="mb-5 flex flex-wrap justify-between gap-4">
            <div>
              <p className="eyebrow">All leads</p>
              <h2 className="mt-1 text-2xl font-bold">Review your matching audience.</h2>
              <p className="mt-2 text-sm text-muted">Search and filter the loaded lead list, then select who belongs in this campaign.</p>
            </div>
            <span className="status good">{effectiveLeads.length} loaded leads</span>
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
            onAddToConnect={onAddToConnect}
            onContinue={() => goTo(1)}
            continueLabel="Continue to campaign setup"
          />
        </section>
      )}

      {step === 1 && (
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
                <p className="mt-2 whitespace-pre-line text-sm">{pendingSequence[0].body}</p>
                <div className="mt-4 grid gap-2">
                  <button className="btn btn-primary w-full text-xs" type="button" onClick={() => { void saveEmailSequence(pendingSequence, pendingPersonalizedEmails); setPendingSequence(null); setPendingPersonalizedEmails(undefined); setRegenerationPrompt(""); }}>Confirm and replace emails</button>
                  <button className="btn btn-secondary w-full text-xs" type="button" onClick={() => { setPendingSequence(null); setPendingPersonalizedEmails(undefined); }}>Discard preview</button>
                </div>
              </div>
            )}
          </section>

          <div className="2xl:col-span-3">
            <CardActions onBack={() => setStep(0)} onNext={() => setStep(2)} nextLabel="Connect inbox" />
          </div>
        </div>
      )}

      {step === 2 && (
        <SetupCard eyebrow="Email account" title="Save the sending inbox for this campaign." description="Enter the business inbox you will use. LeadLens does not send mail until you launch.">
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {providers.map(({ name, description, icon: Icon }) => (
              <div key={name} className="rounded-xl border border-line p-4">
                <Icon className="h-5 w-5 text-green" />
                <h3 className="mt-4 font-bold">{name}</h3>
                <p className="mt-2 text-sm text-muted">{description}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className={`status ${provider === name && email ? "good" : "warn"}`}>
                    {provider === name && email ? "Saved" : "Not saved"}
                  </span>
                  <button className="btn btn-secondary text-xs" type="button" onClick={() => setProviderModal(name)}>
                    {provider === name && email ? "Update" : "Add email"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <CardActions onBack={() => setStep(1)} onNext={() => goTo(3)} nextLabel="Continue" />
        </SetupCard>
      )}

      {step === 3 && (
        <SetupCard eyebrow="Sending preferences" title="Set a considerate sending cadence." description="These limits stay on the campaign record. They do not start sending on their own.">
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">
              Daily limit
              <select className="input mt-2" defaultValue="38" onChange={() => setSendingSaved(false)}>
                <option value="38">38 emails / day</option>
                <option value="25">25 emails / day</option>
                <option value="50">50 emails / day</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              Sending window
              <select className="input mt-2" defaultValue="pkt" onChange={() => setSendingSaved(false)}>
                <option value="pkt">Mon–Fri · 09:00–16:00 PKT</option>
                <option value="late">Mon–Fri · 10:00–17:00 PKT</option>
              </select>
            </label>
          </div>
          <CardActions
            onBack={() => setStep(2)}
            onNext={() => {
              setSendingSaved(true);
              setStep(4);
            }}
            nextLabel="Continue to warmup"
          />
        </SetupCard>
      )}

      {step === 4 && (
        <SetupCard eyebrow="Warmup" title="Confirm sending safeguards." description="Warmup is a safeguard, not an automatic send. Confirm that this inbox should follow the approved cadence after launch.">
          <label className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-canvas p-4 text-sm">
            <input
              type="checkbox"
              className="mt-1 accent-green"
              checked={warmupAcknowledged}
              onChange={(event) => setWarmupAcknowledged(event.target.checked)}
            />
            <span>
              I understand that first sends follow the saved daily limit and sending window, and that this step does not send email by itself.
            </span>
          </label>
          <CardActions onBack={() => setStep(3)} onNext={() => goTo(5)} nextLabel="Continue to review" />
        </SetupCard>
      )}

      {step === 5 && (
        <SetupCard eyebrow="Campaign review" title="Ready for launch?" description="Confirm every required field before enabling the campaign.">
          <div className="mt-5 flex flex-wrap gap-2">
            <span className={`status ${selectedIds.size ? "good" : "warn"}`}>Leads {selectedIds.size ? "ready" : "pending"}</span>
            <span className={`status ${email ? "good" : "warn"}`}>Inbox {email ? "saved" : "pending"}</span>
            <span className={`status ${warmupAcknowledged ? "good" : "warn"}`}>Warmup {warmupAcknowledged ? "confirmed" : "pending"}</span>
            <span className={`status ${sendingSaved ? "good" : "warn"}`}>Sending {sendingSaved ? "saved" : "pending"}</span>
          </div>
          <div className={`mt-5 rounded-xl border p-4 text-sm ${canReview ? "border-green bg-green-soft text-green-dark" : "border-[#ebd9af] bg-gold-soft text-[#73530e]"}`}>
            {canReview ? "Required campaign details are complete." : "Launch stays unavailable until every check is complete."}
          </div>
          <CardActions onBack={() => setStep(4)} onNext={() => canReview && setStep(6)} nextLabel="Continue to launch" disabled={!canReview} />
        </SetupCard>
      )}

      {step === 6 && (
        <SetupCard eyebrow="Launch campaign" title="Launch with the saved campaign data." description="This marks the campaign live in your workspace and opens the dashboard. It does not send a test email from this screen.">
          <div className="mt-5 rounded-xl border border-[#bedbc9] bg-green-soft p-4 text-sm text-green-dark">
            <strong>Audience:</strong> {selectedIds.size} selected leads
            <span className="mt-1 block">Sending inbox: {email || "Not saved"}</span>
            <span className="mt-1 block">Provider: {provider || "Not saved"}</span>
          </div>
          {launchError && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{launchError}</p>}
          <CardActions onBack={() => setStep(5)} onNext={handleLaunch} nextLabel="Launch campaign" disabled={!canReview} />
        </SetupCard>
      )}

      {providerModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-5">
          <div className="w-full max-w-[470px] rounded-[22px] border border-line bg-white p-6 shadow-[var(--shadow)]">
            <button className="float-right icon-btn" type="button" onClick={() => setProviderModal(null)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
            <p className="eyebrow">Sending inbox</p>
            <h2 className="mt-2 font-serif text-3xl">Save {providerModal}</h2>
            <p className="mt-3 text-sm text-muted">Enter the business email that should appear as the sender for this campaign.</p>
            <label className="mt-5 block text-sm font-bold">
              Sending email
              <input className="input mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="hello@company.com" />
            </label>
            <button className="btn btn-primary mt-5 w-full" type="button" onClick={connectProvider}>
              Save inbox
            </button>
            <button className="btn btn-secondary mt-2 w-full" type="button" onClick={() => setProviderModal(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed right-5 bottom-5 z-[100] rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white shadow-xl">
          {toast}
        </div>
      )}
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
