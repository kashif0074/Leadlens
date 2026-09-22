"use client";

import { useState } from "react";
import { CheckCircle2, Save, ShieldCheck } from "lucide-react";

interface SettingsModuleProps {
  connectedEmail?: string;
}

export default function SettingsModule({ connectedEmail }: SettingsModuleProps) {
  const [workspaceName, setWorkspaceName] = useState("LeadLens campaign command");
  const [dailyLimit, setDailyLimit] = useState("38");
  const [sendingWindow, setSendingWindow] = useState("Mon–Fri · 09:00–16:00 PKT");
  const [saved, setSaved] = useState(false);

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="eyebrow">Workspace control</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-muted">Manage workspace identity and the sending safeguards used by your campaigns.</p>
      </header>
      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="surface rounded-3xl p-6">
          <p className="eyebrow">Workspace</p>
          <h2 className="mt-2 text-xl font-bold">Workspace preferences</h2>
          <div className="mt-5 space-y-5">
            <label className="block text-sm font-bold">
              Workspace name
              <input className="input mt-2" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
            </label>
            <label className="block text-sm font-bold">
              Saved sending email
              <input className="input mt-2" value={connectedEmail ?? ""} readOnly placeholder="Save an inbox during campaign setup" />
            </label>
            <label className="block text-sm font-bold">
              Default daily sending limit
              <select className="input mt-2" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)}>
                <option value="25">25 emails / day</option>
                <option value="38">38 emails / day</option>
                <option value="50">50 emails / day</option>
              </select>
            </label>
            <label className="block text-sm font-bold">
              Default sending window
              <select className="input mt-2" value={sendingWindow} onChange={(event) => setSendingWindow(event.target.value)}>
                <option>Mon–Fri · 09:00–16:00 PKT</option>
                <option>Mon–Fri · 10:00–17:00 PKT</option>
              </select>
            </label>
          </div>
        </section>
        <section className="surface rounded-3xl p-6">
          <p className="eyebrow">Safety & data</p>
          <h2 className="mt-2 text-xl font-bold">Deliverability controls</h2>
          <div className="mt-5 space-y-3">
            <SettingRow title="Warmup safeguards" description="Require inbox warmup confirmation before launch." />
            <SettingRow title="Suppression checks" description="Respect bounced and opted-out contacts." />
            <SettingRow title="Review before launch" description="Keep the final campaign checkpoint enabled." />
          </div>
          <div className="mt-5 rounded-xl bg-green-soft p-4 text-sm text-green-dark">
            <ShieldCheck className="mr-2 inline h-4 w-4" />
            Settings save in this browser session only.
          </div>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
          <span className="text-sm text-muted">
            {saved && (
              <>
                <CheckCircle2 className="mr-1 inline h-4 w-4 text-green" />
                Settings saved.
              </>
            )}
          </span>
          <button type="submit" className="btn btn-primary">
            <Save className="h-4 w-4" />
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingRow({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-canvas p-3">
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs text-muted">{description}</p>
      </div>
      <span className="status good">Enabled</span>
    </div>
  );
}
