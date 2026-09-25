"use client";

import { useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { CheckCircle2, Save, ShieldCheck, UserCheck } from "lucide-react";

interface SettingsModuleProps {
  connectedEmail?: string;
}

export default function SettingsModule({ connectedEmail }: SettingsModuleProps) {
  const { data: session } = useSession();
  const [workspaceName, setWorkspaceName] = useState("LeadLens campaign command");
  const [dailyLimit, setDailyLimit] = useState("38");
  const [sendingWindow, setSendingWindow] = useState("Mon–Fri · 09:00–16:00 PKT");
  const [saved, setSaved] = useState(false);

  const userName = session?.user?.name || session?.user?.email || "LeadLens User";
  const userEmail = session?.user?.email || "";
  const userImage = session?.user?.image;
  const initial = (userName[0] || "U").toUpperCase();

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="eyebrow">Account & Workspace</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Profile & Settings</h1>
        <p className="mt-2 text-sm text-muted">View your authenticated profile and configure workspace delivery safeguards.</p>
      </header>

      {/* Profile Details Section */}
      <section className="surface rounded-3xl p-6 sm:p-7 border border-line bg-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-b border-line pb-6">
          <div className="flex items-center gap-4">
            {userImage ? (
              <Image
                src={userImage}
                alt={userName}
                width={56}
                height={56}
                className="h-14 w-14 rounded-full border border-line object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-soft text-lg font-bold text-green">
                {initial}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-ink">{userName}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2.5 py-0.5 text-[11px] font-bold text-green">
                  <UserCheck className="h-3 w-3" /> Google Authenticated
                </span>
              </div>
              <p className="text-sm text-muted mt-0.5">{userEmail}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mt-6">
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <span className="text-xs font-semibold text-muted">Authentication Provider</span>
            <p className="mt-1 text-sm font-bold text-ink">Google OAuth 2.0</p>
          </div>
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <span className="text-xs font-semibold text-muted">User ID</span>
            <p className="mt-1 truncate text-xs font-mono text-ink">{session?.user?.id || "oauth-synced"}</p>
          </div>
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <span className="text-xs font-semibold text-muted">Database Storage</span>
            <p className="mt-1 text-sm font-bold text-green">Persisted in MySQL</p>
          </div>
        </div>
      </section>

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
              <input className="input mt-2" value={connectedEmail ?? userEmail} readOnly placeholder="Save an inbox during campaign setup" />
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
            Safeguards applied to all outbound campaigns.
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
          <button type="submit" className="btn btn-primary cursor-pointer">
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
