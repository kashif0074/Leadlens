// components/modules/ConnectGmail.tsx
"use client";
import { useEffect, useState } from "react";

type GmailAccount = { id: string; email: string; displayName: string };
type ConnectGmailProps = { onConnected: (account: GmailAccount) => Promise<void> | void };

export function ConnectGmail({ onConnected }: ConnectGmailProps) {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    fetch("/api/email-accounts")
      .then(async (response) => {
        const data = (await response.json()) as { accounts?: GmailAccount[] };
        if (!response.ok) throw new Error("Unable to load saved Gmail accounts.");
        setAccounts(data.accounts ?? []);
      })
      .catch(() => setError("Unable to load saved Gmail accounts."))
      .finally(() => setLoadingAccounts(false));
  }, []);

  async function connect() {
    setLoading(true);
    setError("");
    try {
      let account = accounts.find((item) => item.id === selectedAccountId);
      if (!account) {
        const response = await fetch("/api/email-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, appPassword, displayName }),
        });
        const data = (await response.json()) as GmailAccount & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to connect this Gmail account.");
        account = data;
      } else if (displayName.trim() !== account.displayName) {
        const response = await fetch("/api/email-accounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: account.id, displayName }),
        });
        const data = (await response.json()) as GmailAccount & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to update this sender name.");
        account = data;
        setAccounts((current) => current.map((item) => item.id === account?.id ? account! : item));
      }

      await onConnected(account);
      setAppPassword("");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to connect this Gmail account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-xs leading-relaxed text-muted">
        Turn on 2-Step Verification, then create a 16-character App Password in{" "}
        <a className="font-semibold text-green underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
          Google Account settings
        </a>
        . Use that password here, not your regular Gmail password.
      </p>

      {(loadingAccounts || accounts.length > 0) && (
        <label className="block text-xs font-bold">
          Saved Gmail account
          <select
            className="input mt-1.5"
            value={selectedAccountId}
            onChange={(event) => {
              const accountId = event.target.value;
              setSelectedAccountId(accountId);
              setDisplayName(accounts.find((account) => account.id === accountId)?.displayName ?? "");
            }}
            disabled={loadingAccounts}
          >
            <option value="">Connect a new account</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>)}
          </select>
        </label>
      )}

      <label className="block text-xs font-bold">
        Sender name
        <input className="input mt-1.5" type="text" autoComplete="name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name or business name" />
      </label>

      {!selectedAccountId && (
        <>
          <label className="block text-xs font-bold">
            Gmail address
            <input className="input mt-1.5" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" />
          </label>
          <label className="block text-xs font-bold">
            16-character App Password
            <input className="input mt-1.5" type="password" autoComplete="new-password" value={appPassword} onChange={(event) => setAppPassword(event.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
          </label>
        </>
      )}

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</p>}
      <button className="btn btn-primary w-full text-xs" type="button" disabled={loading || !displayName.trim() || (!selectedAccountId && (!email.trim() || !appPassword.trim()))} onClick={connect}>
        {loading ? "Verifying Gmail..." : selectedAccountId ? "Use saved Gmail account" : "Verify and connect Gmail"}
      </button>
    </div>
  );
}