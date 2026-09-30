"use client";

import { useEffect, useState } from "react";

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
    <div className="mt-4 space-y-4">
      {connectedEmail && loadingAccounts ? (
        <p className="rounded-xl border border-line bg-canvas p-4 text-sm text-muted" role="status">Checking Gmail connection...</p>
      ) : connectedEmail && currentAccount?.status === "connected" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green/20 bg-green-soft p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-green-dark">Connected</p>
            <p className="mt-1 text-sm font-semibold text-ink">{connectedEmail}</p>
          </div>
          <button type="button" className="btn btn-secondary text-xs" disabled={loading} onClick={disconnect}>
            Disconnect Gmail
          </button>
        </div>
      ) : connectedEmail ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div>
            <strong>Reconnect required</strong>
            <p className="mt-1">{connectedEmail} needs Gmail authorization again before sending.</p>
          </div>
          {currentAccount && (
            <button type="button" className="btn btn-secondary text-xs" disabled={loading} onClick={disconnect}>
              Disconnect Gmail
            </button>
          )}
        </div>
      ) : null}

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
        <button className="btn btn-secondary w-full text-xs" type="button" disabled={loading} onClick={useSavedAccount}>
          {loading ? "Saving sender..." : `Use ${selectedAccount.email} for this campaign`}
        </button>
      )}

      <button className="btn btn-primary w-full text-xs" type="button" disabled={loading} onClick={connectGmail}>
        {loading ? "Connecting Gmail..." : connectedEmail ? "Reconnect Gmail" : "Connect Gmail"}
      </button>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}