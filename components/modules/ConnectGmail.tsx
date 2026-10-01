"use client";

import { useEffect, useState } from "react";
import { Mail, Send, Server } from "lucide-react";

type GmailAccount = { id: string; email: string; displayName: string; status: string };
type GmailOAuthMessage = {
  type: "leadlens:gmail-oauth";
  account?: GmailAccount;
  error?: string;
};

type ConnectGmailProps = {
  campaignId: string;
  connectedEmail: string;
  onConnected: (account: GmailAccount) => Promise<void> | void;
  onDisconnected: (accountId: string) => Promise<void> | void;
};

export function ConnectGmail({ campaignId, connectedEmail, onConnected, onDisconnected }: ConnectGmailProps) {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    fetch("/api/email-accounts", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { accounts?: GmailAccount[] };
        if (!response.ok) throw new Error("Unable to load saved Gmail accounts.");
        setAccounts(data.accounts ?? []);
      })
      .catch(() => setError("Unable to load saved Gmail accounts."))
      .finally(() => setLoadingAccounts(false));
  }, []);

  useEffect(() => {
    const handleOAuthMessage = async (event: MessageEvent<GmailOAuthMessage>) => {
      if (event.origin !== window.location.origin || event.data?.type !== "leadlens:gmail-oauth") return;
      if (event.data.error || !event.data.account) {
        setError(event.data.error ?? "Unable to connect Gmail.");
        return;
      }

      setLoading(true);
      setError("");
      try {
        await onConnected(event.data.account);
        setAccounts((current) => [
          event.data.account!,
          ...current.filter((account) => account.id !== event.data.account!.id),
        ]);
        setSelectedAccountId(event.data.account.id);
      } catch (connectError) {
        setError(connectError instanceof Error ? connectError.message : "Unable to save this Gmail account to the campaign.");
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [onConnected]);

  const currentAccount = accounts.find((account) => account.email.toLowerCase() === connectedEmail.toLowerCase());
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId);
  const connectionLabel = loadingAccounts && connectedEmail
    ? "Checking..."
    : currentAccount?.status === "connected"
      ? "Connected"
      : connectedEmail
        ? "Reconnect required"
        : "Disconnected";

  function connectGmail() {
    if (!campaignId) {
      setError("Save the campaign before connecting Gmail.");
      return;
    }
    const params = new URLSearchParams({ campaignId, displayName });
    const popup = window.open(
      `/api/email-accounts/oauth/start?${params.toString()}`,
      "leadlens-gmail-oauth",
      "popup,width=600,height=720",
    );
    if (!popup) setError("Allow pop-ups for LeadLens to connect Gmail.");
  }

  async function useSavedAccount() {
    if (!selectedAccount || selectedAccount.status !== "connected") return;
    setLoading(true);
    setError("");
    try {
      let account = selectedAccount;
      if (displayName.trim() !== account.displayName) {
        const response = await fetch("/api/email-accounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: account.id, displayName }),
        });
        const result = (await response.json()) as GmailAccount & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to update the sender name.");
        account = { ...account, displayName: result.displayName };
        setAccounts((current) => current.map((item) => item.id === account.id ? account : item));
      }
      await onConnected(account);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to connect this Gmail account to the campaign.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!currentAccount) return;
    setLoading(true);
    setError("");
    try {
      await onDisconnected(currentAccount.id);
      setAccounts((current) => current.filter((account) => account.id !== currentAccount.id));
      setSelectedAccountId("");
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Unable to disconnect Gmail.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <section className="flex min-h-64 flex-col rounded-2xl border border-green/20 bg-white p-5 shadow-2xs">
          <Mail className="h-6 w-6 text-green" aria-hidden="true" />
          <h3 className="mt-5 text-base font-bold text-ink">Google Workspace / Gmail</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">Connect a managed Google inbox and verify sending readiness.</p>
          {currentAccount?.status === "connected" && connectedEmail && (
            <p className="mt-3 break-all text-sm font-semibold text-ink" role="status">{connectedEmail}</p>
          )}
          {connectedEmail && currentAccount?.status !== "connected" && !loadingAccounts && (
            <p className="mt-3 text-xs text-amber-800">This account needs Gmail authorization again.</p>
          )}
          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${currentAccount?.status === "connected" ? "bg-green-soft text-green-dark" : "bg-gold-soft text-gold"}`}>
              {connectionLabel}
            </span>
            {currentAccount?.status === "connected" ? (
              <button type="button" className="btn btn-secondary text-xs" disabled={loading} onClick={disconnect}>
                Disconnect
              </button>
            ) : (
              <button type="button" className="btn btn-primary text-xs" disabled={loading} onClick={connectGmail}>
                {loading ? "Connecting..." : "Connect"}
              </button>
            )}
          </div>
        </section>

        <section className="flex min-h-64 flex-col rounded-2xl border border-line bg-white p-5 shadow-2xs">
          <Send className="h-6 w-6 text-green" aria-hidden="true" />
          <h3 className="mt-5 text-base font-bold text-ink">Microsoft Outlook / Microsoft 365</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">Connect an organization inbox with a secure setup flow.</p>
          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold">Disconnected</span>
            <button type="button" className="btn btn-secondary text-xs">Connect</button>
          </div>
        </section>

        <section className="flex min-h-64 flex-col rounded-2xl border border-line bg-white p-5 shadow-2xs">
          <Server className="h-6 w-6 text-green" aria-hidden="true" />
          <h3 className="mt-5 text-base font-bold text-ink">Other email provider</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">Use guided SMTP or provider-specific connection instructions.</p>
          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-bold text-gold">Disconnected</span>
            <button type="button" className="btn btn-secondary text-xs">Connect</button>
          </div>
        </section>
      </div>

      <details className="rounded-xl border border-line bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">Gmail account settings</summary>
        <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
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
                disabled={loadingAccounts || loading}
              >
                <option value="">Connect a different account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email}{account.status !== "connected" ? " · Reconnect required" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs font-bold">
            Sender name
            <input
              className="input mt-1.5"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Your name or business name"
            />
          </label>

          {selectedAccount?.status === "connected" && selectedAccount.email !== connectedEmail && (
            <button className="btn btn-secondary text-xs sm:col-span-2 sm:justify-self-start" type="button" disabled={loading} onClick={useSavedAccount}>
              {loading ? "Saving sender..." : `Use ${selectedAccount.email} for this campaign`}
            </button>
          )}
        </div>
      </details>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}