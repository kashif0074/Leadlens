"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Lock, Mail, Server, Send } from "lucide-react";
import { generatedLeadPool, leadDomain } from "../../lib/leads";
import type { Lead } from "../../types";

export interface LeadGenerationContext {
  prompt: string;
  selectedLeadIds: string[];
  selectedLeads: Lead[];
  allLeads: Lead[];
  connectedEmail: string;
  provider: string;
  companyDomain: string;
}

interface LeadGenerationModuleProps {
  prompt: string;
  onConnectionComplete: (context: LeadGenerationContext) => void;
}

const providers = [
  { name: "Gmail / Google Workspace", icon: Mail },
  { name: "Microsoft Outlook", icon: Send },
  { name: "Other email provider", icon: Server },
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LeadGenerationModule({ prompt, onConnectionComplete }: LeadGenerationModuleProps) {
  const [stage, setStage] = useState<"preview" | "connection">("preview");
  const [provider, setProvider] = useState("");
  const [email, setEmail] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const [accountName, setAccountName] = useState("");
  const previewLeads = useMemo(() => generatedLeadPool.slice(0, 3), []);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(previewLeads.map((lead) => lead.id)));
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const connectWorkspace = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedDomain = companyDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!provider || !accountName.trim() || !emailPattern.test(trimmedEmail) || !trimmedDomain) {
      setError("Enter your name, a valid business email, provider, and company domain.");
      return;
    }

    setError("");
    setIsConnecting(true);
    const selectedLeads = generatedLeadPool.filter((lead) => selected.has(lead.id));
    onConnectionComplete({
      prompt,
      selectedLeadIds: selectedLeads.map((lead) => lead.id),
      selectedLeads,
      allLeads: generatedLeadPool,
      connectedEmail: trimmedEmail,
      provider,
      companyDomain: trimmedDomain,
    });
  };

  if (stage === "connection") {
    return (
      <main className="min-h-screen bg-canvas px-4 py-8 sm:px-8 lg:py-14">
        <div className="mx-auto max-w-3xl">
          <p className="eyebrow">Unlock the complete audience</p>
          <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Create your workspace and save your sending details.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Sign up with your business email and company domain. This stores workspace details so you can open the full lead list. It does not send mail.
          </p>

          <form onSubmit={connectWorkspace} className="surface panel mt-8 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Full name
                <input className="input mt-2" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Alex Morgan" required />
              </label>
              <label className="text-sm font-semibold">
                Business email
                <input className="input mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Company domain
              <input className="input mt-2" value={companyDomain} onChange={(event) => setCompanyDomain(event.target.value)} placeholder="company.com" required />
            </label>

            <div>
              <p className="text-sm font-semibold">Business email provider</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {providers.map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setProvider(name)}
                    className={`rounded-2xl border p-4 text-left text-sm ${provider === name ? "border-green bg-green-soft text-green-dark" : "border-line bg-white hover:border-green"}`}
                  >
                    <Icon className="h-5 w-5 text-green" />
                    <span className="mt-3 block font-bold">{name}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap justify-between gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => setStage("preview")}>
                Back to preview
              </button>
              <button type="submit" className="btn btn-primary" disabled={isConnecting}>
                {isConnecting ? "Opening workspace..." : "Sign up and continue"} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 sm:px-8 lg:py-14">
      <div className="mx-auto max-w-5xl">
        <p className="eyebrow">Lead generation preview</p>
        <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Your first matching leads are ready.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          Three initial leads were generated from your campaign brief. Sign in with your business email to open the full list.
        </p>
        <div className="mt-6 rounded-2xl border border-line bg-white p-4">
          <p className="text-xs font-bold tracking-wider text-green uppercase">Campaign brief</p>
          <p className="mt-2 text-sm text-muted">{prompt}</p>
        </div>

        <section className="surface panel mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Initial leads</h2>
              <p className="mt-1 text-sm text-muted">One lead per row. Showing 3 generated leads.</p>
            </div>
            <span className="status warn">
              <Lock className="mr-1 inline h-3.5 w-3.5" /> Full list locked
            </span>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wider text-muted uppercase">
                  <th className="px-3 py-3">Select</th>
                  <th className="px-3 py-3">Lead</th>
                  <th className="px-3 py-3">Company</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Domain</th>
                </tr>
              </thead>
              <tbody>
                {previewLeads.map((lead) => (
                  <tr key={lead.id} className="h-16 border-b border-line last:border-0">
                    <td className="px-3 py-4">
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} aria-label={`Select ${lead.name}`} />
                    </td>
                    <td className="px-3 py-4 font-semibold">{lead.name}</td>
                    <td className="px-3 py-4">{lead.company}</td>
                    <td className="px-3 py-4">{lead.jobTitle}</td>
                    <td className="px-3 py-4">{lead.location}</td>
                    <td className="px-3 py-4 text-muted">{leadDomain(lead)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-sm text-muted">{selected.size} of 3 preview leads selected.</p>
            <button type="button" className="btn btn-primary" onClick={() => setStage("connection")}>
              Show More Leads <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
