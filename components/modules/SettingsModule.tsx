"use client";

import { useState } from "react";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import {
  CheckCircle2,
  Save,
  User,
  Mail,
  Building2,
  ShieldCheck,
  LogOut,
  Bell,
  Check,
} from "lucide-react";

interface SettingsModuleProps {
  connectedEmail?: string;
}

export default function SettingsModule({ connectedEmail }: SettingsModuleProps) {
  const { data: session } = useSession();
  const [workspaceName, setWorkspaceName] = useState("My Workspace");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [replyAlerts, setReplyAlerts] = useState(true);
  const [saved, setSaved] = useState(false);

  const userName = session?.user?.name || session?.user?.email || "LeadLens User";
  const userEmail = session?.user?.email || "";
  const userImage = session?.user?.image;
  const initial = (userName[0] || "U").toUpperCase();
  const activeEmail = connectedEmail || userEmail;

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-12">
      {/* Page Header */}
      <header>
        <p className="eyebrow">Account & Settings</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-ink">Profile & Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your personal details, workspace preferences, and connected accounts.
        </p>
      </header>

      {/* Profile Overview Card */}
      <section className="surface rounded-3xl p-6 sm:p-8 border border-line bg-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-b border-line pb-6">
          <div className="flex items-center gap-4">
            {userImage ? (
              <Image
                src={userImage}
                alt={userName}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full border border-line object-cover shadow-2xs"
                unoptimized
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-soft text-xl font-bold text-green">
                {initial}
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold text-ink">{userName}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-3 py-0.5 text-xs font-bold text-green-dark">
                  <Check className="h-3.5 w-3.5" /> Verified Account
                </span>
              </div>
              <p className="text-sm text-muted mt-1">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Profile Info Details Grid */}
        <div className="grid gap-4 sm:grid-cols-3 mt-6">
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <span className="text-xs font-semibold text-muted">Full Name</span>
            <p className="mt-1 text-sm font-bold text-ink truncate">{userName}</p>
          </div>
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <span className="text-xs font-semibold text-muted">Email Address</span>
            <p className="mt-1 text-sm font-bold text-ink truncate">{userEmail || "Not provided"}</p>
          </div>
          <div className="rounded-2xl border border-line bg-canvas p-4">
            <span className="text-xs font-semibold text-muted">Sign-in Method</span>
            <p className="mt-1 text-sm font-bold text-ink">Google Account</p>
          </div>
        </div>
      </section>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Workspace Preferences */}
        <section className="surface rounded-3xl p-6 sm:p-8 border border-line bg-white shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-soft text-green">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Workspace Preferences</h2>
              <p className="text-xs text-muted">Customize your team workspace and general settings</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-bold text-ink">
                Workspace Name
                <input
                  type="text"
                  className="input mt-2"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="e.g. Acme Sales Outreach"
                />
              </label>
            </div>

            <div>
              <label className="block text-sm font-bold text-ink">
                Sending Account
                <input
                  type="text"
                  className="input mt-2 bg-canvas cursor-not-allowed"
                  value={activeEmail || "No sender connected"}
                  readOnly
                />
              </label>
              <p className="mt-1.5 text-xs text-muted">The email address currently used for outbound campaigns.</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-ink">
                Sending Pace
                <input
                  type="text"
                  className="input mt-2 bg-canvas cursor-not-allowed"
                  value="Safe standard pacing"
                  readOnly
                />
              </label>
              <p className="mt-1.5 text-xs text-muted">Balanced delivery rate to keep your email reputation healthy.</p>
            </div>
          </div>
        </section>

        {/* Connected Email Account */}
        <section className="surface rounded-3xl p-6 sm:p-8 border border-line bg-white shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-soft text-green">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Connected Email</h2>
              <p className="text-xs text-muted">Manage your email sending and inbox integration</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-line bg-canvas p-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-line shadow-2xs text-green font-bold">
                G
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-ink">Google Workspace / Gmail</p>
                  <span className="inline-flex items-center rounded-full bg-green-soft px-2.5 py-0.5 text-[11px] font-bold text-green-dark">
                    Connected
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {activeEmail ? `Connected as ${activeEmail}` : "Connected via your Google account"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Notification Preferences */}
        <section className="surface rounded-3xl p-6 sm:p-8 border border-line bg-white shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-soft text-green">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Notifications</h2>
              <p className="text-xs text-muted">Choose how and when you want to receive updates</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-canvas p-4 cursor-pointer hover:bg-mist/60 transition-colors">
              <div>
                <p className="text-sm font-bold text-ink">Prospect Reply Alerts</p>
                <p className="mt-0.5 text-xs text-muted">Get notified immediately whenever a lead replies to your outreach.</p>
              </div>
              <input
                type="checkbox"
                checked={replyAlerts}
                onChange={(e) => setReplyAlerts(e.target.checked)}
                className="mt-1 h-4 w-4 rounded accent-green cursor-pointer"
              />
            </label>

            <label className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-canvas p-4 cursor-pointer hover:bg-mist/60 transition-colors">
              <div>
                <p className="text-sm font-bold text-ink">Daily Campaign Summary</p>
                <p className="mt-0.5 text-xs text-muted">Receive a daily digest of sent messages, replies, and scheduled follow-ups.</p>
              </div>
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="mt-1 h-4 w-4 rounded accent-green cursor-pointer"
              />
            </label>
          </div>
        </section>

        {/* Account Security & Sign Out */}
        <section className="surface rounded-3xl p-6 sm:p-8 border border-line bg-white shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-soft text-green">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Account & Security</h2>
              <p className="text-xs text-muted">Your sign-in credentials and session security</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-line bg-canvas p-5">
            <div>
              <p className="text-sm font-bold text-ink">Google Single Sign-On</p>
              <p className="text-xs text-muted mt-1 max-w-md">
                Your account is protected through your Google sign-in. Passwords and two-factor authentication are managed directly through Google.
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="btn btn-secondary text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 shrink-0 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </section>

        {/* Save Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-sm">
            {saved && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-green">
                <CheckCircle2 className="h-4 w-4" />
                Settings saved successfully.
              </span>
            )}
          </div>
          <button type="submit" className="btn btn-primary cursor-pointer px-6">
            <Save className="h-4 w-4" />
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
