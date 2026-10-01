"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Inbox as InboxIcon,
  Send,
  RefreshCw,
  Search,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Check,
  CornerUpLeft,
  X,
  SlidersHorizontal,
  Menu,
  Building2,
  MessageSquare,
  ShieldCheck,
  Tag,
  Copy,
} from "lucide-react";
import type { InboxEmailItem } from "@/app/api/inbox/route";

interface InboxModuleProps {
  launched?: boolean;
  onNavigate?: (module: string) => void;
  connectedEmail?: string;
}

type ActiveFolder = "inbox" | "sent";
type StatusFilter = "all" | "replied" | "meetings" | "contacted" | "failed";

function formatListDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    }

    const isThisYear = date.getFullYear() === now.getFullYear();
    if (isThisYear) {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return dateStr;
  }
}

function formatDetailDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

const AVATAR_GRADIENTS = [
  "from-[#00675f] to-[#004b47]",
  "from-[#172330] to-[#004b47]",
  "from-[#00675f] to-[#172330]",
  "from-[#b48629] to-[#886416]",
  "from-[#00675f] to-[#24453b]",
  "from-[#62736e] to-[#172330]",
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

export default function InboxModule({
  connectedEmail,
}: InboxModuleProps) {
  // Collapsible Left Navigation State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Folder Navigation State
  const [activeFolder, setActiveFolder] = useState<ActiveFolder>("inbox");

  // Filters State
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Data States
  const [inboxItems, setInboxItems] = useState<InboxEmailItem[]>([]);
  const [sentItems, setSentItems] = useState<InboxEmailItem[]>([]);
  const [stats, setStats] = useState({
    inboxCount: 0,
    unreadInboxCount: 0,
    sentCount: 0,
    totalDeliveries: 0,
    totalSent: 0,
    totalFailed: 0,
    connectedAccountsCount: 0,
  });
  const [connectedAccounts, setConnectedAccounts] = useState<
    { id: string; email: string; displayName: string }[]
  >([]);
  const [currentUser, setCurrentUser] = useState({ email: "", name: "" });

  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Quick Reply Composer State inside Email Reading View
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showRecipientDetails, setShowRecipientDetails] = useState(false);

  // Fetch real email data from /api/inbox
  const fetchEmails = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    setError(null);

    try {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : `Failed to load mail (HTTP ${res.status})`,
        );
      }
      setInboxItems(data.inboxItems || []);
      setSentItems(data.sentItems || []);
      if (data.stats) setStats(data.stats);
      if (data.connectedAccounts) setConnectedAccounts(data.connectedAccounts);
      if (data.currentUser) setCurrentUser(data.currentUser);
    } catch (err) {
      console.error("[InboxModule] Load error:", err);
      setError(err instanceof Error ? err.message : "Unable to load mail.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void fetchEmails(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchEmails();
    }, 30_000);
    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(interval);
    };
  }, [fetchEmails]);

  const handleBackToList = useCallback(() => {
    setSelectedEmailId(null);
    setShowReplyBox(false);
    setReplyError(null);
    setReplySuccess(false);
  }, []);

  // Keyboard shortcut support: Ctrl+K / Cmd+K for search, Escape to return from email view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.getElementById("inbox-search-input") as HTMLInputElement | null;
        searchInput?.focus();
      } else if (e.key === "Escape" && selectedEmailId) {
        handleBackToList();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEmailId, handleBackToList]);

  // Current folder list of emails
  const currentList = activeFolder === "inbox" ? inboxItems : sentItems;

  // Available campaigns for dropdown
  const availableCampaigns = useMemo(() => {
    const list = new Set<string>();
    [...inboxItems, ...sentItems].forEach((item) => {
      if (item.campaignName) list.add(item.campaignName);
    });
    return Array.from(list);
  }, [inboxItems, sentItems]);

  // Filtered emails based on search query, status filter, and campaign filter
  const filteredEmails = useMemo(() => {
    return currentList.filter((item) => {
      // 1. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (item.lead?.name || item.senderName || item.recipientName || "").toLowerCase().includes(q);
        const emailMatch = (item.recipientEmail || item.senderEmail || "").toLowerCase().includes(q);
        const subjectMatch = (item.subject || "").toLowerCase().includes(q);
        const previewMatch = (item.preview || "").toLowerCase().includes(q);
        const companyMatch = (item.lead?.company || "").toLowerCase().includes(q);
        const campaignMatch = (item.campaignName || "").toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !subjectMatch && !previewMatch && !companyMatch && !campaignMatch) {
          return false;
        }
      }

      // 2. Status Filter
      if (statusFilter === "replied" && item.status !== "Replied" && item.lead?.status !== "Replied") {
        return false;
      }
      if (statusFilter === "meetings" && item.status !== "Meeting Booked" && item.lead?.status !== "Meeting Booked") {
        return false;
      }
      if (statusFilter === "contacted" && item.status !== "Contacted" && item.status !== "Sent" && item.status !== "Sending") {
        return false;
      }
      if (statusFilter === "failed" && item.status !== "Failed") {
        return false;
      }

      // 3. Campaign Filter
      if (campaignFilter !== "all" && item.campaignName !== campaignFilter) {
        return false;
      }

      return true;
    });
  }, [currentList, searchQuery, statusFilter, campaignFilter]);

  // Selected email item for Reading View
  const selectedEmail = useMemo(() => {
    if (!selectedEmailId) return null;
    return (
      inboxItems.find((i) => i.id === selectedEmailId || i.threadId === selectedEmailId) ||
      sentItems.find((i) => i.id === selectedEmailId || i.threadId === selectedEmailId) ||
      null
    );
  }, [selectedEmailId, inboxItems, sentItems]);

  // Select an email
  const handleOpenEmail = (email: InboxEmailItem) => {
    setSelectedEmailId(email.id);
    setShowReplyBox(false);
    setReplyBody("");
    setReplyError(null);
    setReplySuccess(false);
    const prevSub = email.subject || "";
    setReplySubject(prevSub.startsWith("Re:") ? prevSub : `Re: ${prevSub}`);
  };

  const handleCopyEmail = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  // Send reply handler
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmail || !replyBody.trim()) return;

    setIsSendingReply(true);
    setReplyError(null);
    setReplySuccess(false);

    try {
      const recipientToReply =
        selectedEmail.folder === "inbox"
          ? selectedEmail.senderEmail || selectedEmail.recipientEmail
          : selectedEmail.recipientEmail;

      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: recipientToReply,
          subject: replySubject.trim() || "Follow up",
          body: replyBody.trim(),
          campaignId: selectedEmail.campaignId,
          leadId: selectedEmail.leadId,
          senderEmail: selectedEmail.folder === "inbox" ? selectedEmail.recipientEmail : (selectedEmail.senderEmail || connectedEmail || connectedAccounts[0]?.email),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send email reply.");
      }

      setReplySuccess(true);
      setReplyBody("");

      // Re-fetch to get updated thread and sent list
      await fetchEmails();
    } catch (err) {
      console.error("[InboxModule] Reply error:", err);
      setReplyError(err instanceof Error ? err.message : "Failed to send email reply.");
    } finally {
      setIsSendingReply(false);
    }
  };

  // Status update handler
  const handleUpdateStatus = async (newStatus: "Contacted" | "Replied" | "Meeting Booked") => {
    if (!selectedEmail) return;
    setUpdatingStatus(true);

    try {
      const res = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedEmail.leadId,
          recipient: selectedEmail.recipientEmail,
          status: newStatus,
        }),
      });

      if (!res.ok) throw new Error("Failed to update status");
      await fetchEmails();
    } catch (err) {
      console.error("[InboxModule] Status update error:", err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Status Filter counts
  const filterCounts = useMemo(() => {
    return {
      all: currentList.length,
      replied: currentList.filter((i) => i.status === "Replied" || i.lead?.status === "Replied").length,
      meetings: currentList.filter((i) => i.status === "Meeting Booked" || i.lead?.status === "Meeting Booked").length,
      contacted: currentList.filter((i) => i.status === "Contacted" || i.status === "Sent" || i.status === "Sending").length,
      failed: currentList.filter((i) => i.status === "Failed").length,
    };
  }, [currentList]);

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-canvas text-ink">
      {/* Top Header & Search Bar with Collapsible Menu Button */}
      <div className="border-b border-line bg-white px-4 py-2.5 flex flex-col gap-2.5 shrink-0 shadow-[0_1px_2px_rgba(12,46,38,0.03)]">
        <div className="flex items-center justify-between gap-3">
          {/* Menu Button + Omni Search Input */}
          <div className="flex items-center gap-2.5 flex-1 max-w-2xl">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="icon-btn h-9 w-9 shrink-0 items-center justify-center rounded-xl cursor-pointer"
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted" />
              <input
                id="inbox-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search in ${activeFolder === "inbox" ? "Inbox" : "Sent"} by contact, company, subject, or content...`}
                className="w-full h-9 pl-9 pr-14 rounded-xl border border-line bg-canvas text-xs text-ink placeholder:text-muted focus:bg-white focus:border-green focus:ring-2 focus:ring-green/15 transition-all outline-none"
              />
              <div className="absolute top-2 right-2.5 flex items-center gap-1">
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-[11px] text-muted hover:text-ink cursor-pointer"
                  >
                    Clear
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-muted bg-mist border border-line rounded-md">
                    ⌘K
                  </kbd>
                )}
              </div>
            </div>
          </div>

          {/* Sync Button & Total Count */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => fetchEmails(true)}
              disabled={isRefreshing || isLoading}
              className="btn btn-secondary !min-h-0 !py-1.5 !px-3.5 !text-xs !font-semibold cursor-pointer disabled:opacity-50"
              title="Sync mail with server"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-green" : "text-muted"}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Syncing..." : "Sync Mail"}</span>
            </button>

            <span className="text-xs text-muted font-medium hidden sm:inline">
              {filteredEmails.length} {filteredEmails.length === 1 ? "conversation" : "conversations"}
            </span>
          </div>
        </div>

        {/* Filter Chips & Campaign Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all" as StatusFilter, label: "All", count: filterCounts.all, dot: "bg-muted" },
              { id: "replied" as StatusFilter, label: "Replied", count: filterCounts.replied, dot: "bg-green" },
              { id: "meetings" as StatusFilter, label: "Meetings", count: filterCounts.meetings, dot: "bg-gold" },
              { id: "contacted" as StatusFilter, label: "Contacted", count: filterCounts.contacted, dot: "bg-green/70" },
              ...(filterCounts.failed > 0
                ? [{ id: "failed" as StatusFilter, label: "Delivery Issues", count: filterCounts.failed, dot: "bg-danger" }]
                : []),
            ].map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? "bg-green text-white shadow-xs font-bold"
                      : "text-muted hover:bg-mist hover:text-ink"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-green-soft" : tab.dot}`} />
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-mist text-muted border border-line/60"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Campaign Selector Filter */}
          {availableCampaigns.length > 1 && (
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted" />
              <select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                className="input !w-auto !py-1 !px-2.5 !text-xs bg-white border border-line rounded-lg text-ink font-medium"
              >
                <option value="all">All Campaigns</option>
                {availableCampaigns.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex min-h-0 divide-x divide-line overflow-hidden">
        {/* ========================================================= */}
        {/* LEFT SIDEBAR: Collapsible Inbox / Sent Menu               */}
        {/* ========================================================= */}
        <aside
          className={`${
            isSidebarOpen
              ? "w-52 lg:w-56 p-3 opacity-100"
              : "w-0 p-0 border-r-0 opacity-0 overflow-hidden"
          } shrink-0 bg-white flex flex-col justify-between border-r border-line transition-all duration-200 ease-in-out`}
        >
          <div className="space-y-1">
            <div className="px-2 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Mailbox
              </span>
            </div>

            {/* 1. Inbox Folder */}
            <button
              type="button"
              onClick={() => {
                setActiveFolder("inbox");
                setSelectedEmailId(null);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeFolder === "inbox"
                  ? "bg-green text-white font-bold shadow-xs"
                  : "text-ink hover:bg-mist hover:text-green"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <InboxIcon className={`h-4 w-4 ${activeFolder === "inbox" ? "text-white" : "text-muted"}`} />
                <span>Inbox</span>
              </div>
              {stats.inboxCount > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    activeFolder === "inbox"
                      ? "bg-white/20 text-white"
                      : "bg-green-soft text-green"
                  }`}
                >
                  {stats.inboxCount}
                </span>
              )}
            </button>

            {/* 2. Sent Folder */}
            <button
              type="button"
              onClick={() => {
                setActiveFolder("sent");
                setSelectedEmailId(null);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeFolder === "sent"
                  ? "bg-green text-white font-bold shadow-xs"
                  : "text-ink hover:bg-mist hover:text-green"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Send className={`h-4 w-4 ${activeFolder === "sent" ? "text-white" : "text-muted"}`} />
                <span>Sent</span>
              </div>
              {stats.sentCount > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    activeFolder === "sent"
                      ? "bg-white/20 text-white"
                      : "bg-mist text-muted border border-line/60"
                  }`}
                >
                  {stats.sentCount}
                </span>
              )}
            </button>
          </div>

          {/* Connected User Account Widget */}
          <div className="pt-3 border-t border-line">
            <div className="flex items-center gap-2.5 rounded-xl bg-canvas p-2.5 border border-line">
              <div className="h-7 w-7 rounded-lg bg-green text-white flex items-center justify-center font-bold text-xs shrink-0">
                {(currentUser.name?.[0] || currentUser.email?.[0] || "U").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink truncate">
                  {currentUser.name || "Authenticated User"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
                  <span className="text-[10px] text-green font-medium">SMTP Active</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* RIGHT CONTENT: Email List OR Full Reading View            */}
        {/* ========================================================= */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-white overflow-hidden">
          {/* ------------------------------------------------------- */}
          {/* CASE 1: EMAIL READING VIEW (Gmail / Superhuman Style)    */}
          {/* ------------------------------------------------------- */}
          {selectedEmail ? (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white">
              {/* Reading View Navigation Header */}
              <div className="border-b border-line px-4 py-2.5 flex items-center justify-between bg-canvas shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="btn btn-secondary !min-h-0 !py-1.5 !px-3 !text-xs !font-semibold cursor-pointer shadow-2xs"
                    title="Back to list (Esc)"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back to {activeFolder === "inbox" ? "Inbox" : "Sent"}</span>
                  </button>
                </div>

                {/* Lead Status Action Switcher */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted font-medium hidden sm:inline">Lead stage:</span>
                  <div className="inline-flex rounded-xl bg-white p-0.5 border border-line text-xs shadow-2xs">
                    {(["Contacted", "Replied", "Meeting Booked"] as const).map((st) => {
                      const active = selectedEmail.lead?.status === st || selectedEmail.status === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => handleUpdateStatus(st)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                            active
                              ? "bg-green text-white font-bold shadow-2xs"
                              : "text-muted hover:text-ink hover:bg-mist"
                          }`}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Scrollable Reading Content */}
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
                {/* Subject Heading */}
                <div className="pb-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-ink">
                      {selectedEmail.subject || "(No Subject)"}
                    </h1>
                    {selectedEmail.campaignName && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted">
                        <Tag className="h-3.5 w-3.5 text-green" />
                        <span>Campaign: <strong className="text-ink">{selectedEmail.campaignName}</strong></span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                        selectedEmail.status === "Replied"
                          ? "bg-green-soft text-green border border-sage"
                          : selectedEmail.status === "Meeting Booked"
                          ? "bg-gold-soft text-gold border border-amber-200"
                          : selectedEmail.status === "Failed"
                          ? "bg-red-50 text-danger border border-red-200"
                          : "bg-mist text-muted border border-line"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          selectedEmail.status === "Replied"
                            ? "bg-green"
                            : selectedEmail.status === "Meeting Booked"
                            ? "bg-gold"
                            : selectedEmail.status === "Failed"
                            ? "bg-danger"
                            : "bg-muted"
                        }`}
                      />
                      {selectedEmail.status}
                    </span>
                  </div>
                </div>

                {/* Message Thread History Cards */}
                <div className="space-y-4">
                  {selectedEmail.messages.map((msg, idx) => {
                    const isLatest = idx === selectedEmail.messages.length - 1;
                    const isOutbound = msg.direction === "outbound";
                    const senderDisplayName = isOutbound
                      ? currentUser.name || "You"
                      : msg.senderName || selectedEmail.lead?.name || selectedEmail.senderName || msg.senderEmail;
                    const senderAddress = msg.senderEmail;
                    const recipientAddress = msg.recipient;
                    const avatarInitial = (senderDisplayName[0] || senderAddress[0] || "U").toUpperCase();
                    const avatarGradient = getAvatarGradient(senderDisplayName);

                    return (
                      <div
                        key={msg.id || idx}
                        className={`rounded-2xl border p-5 sm:p-6 transition-all ${
                          isLatest
                            ? "border-line bg-white shadow-xs"
                            : "border-line/70 bg-canvas/70"
                        }`}
                      >
                        {/* Message Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3.5 min-w-0">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarGradient} text-white font-bold text-sm shadow-xs`}>
                              {avatarInitial}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <strong className="text-sm font-bold text-ink">
                                  {senderDisplayName}
                                </strong>
                                <span className="text-xs text-muted">
                                  &lt;{senderAddress}&gt;
                                </span>
                              </div>
                              <div className="text-xs text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span>to <strong className="text-ink">{recipientAddress}</strong></span>
                                <button
                                  type="button"
                                  onClick={() => setShowRecipientDetails((prev) => !prev)}
                                  className="text-[10px] text-green hover:underline cursor-pointer"
                                >
                                  {showRecipientDetails ? "hide details" : "view details"}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 text-xs text-muted font-medium">
                            <time>{formatDetailDate(msg.sentAt || msg.createdAt)}</time>
                          </div>
                        </div>

                        {/* Collapsible Technical Details */}
                        {showRecipientDetails && (
                          <div className="mt-3 rounded-xl bg-mist p-3 text-xs text-muted space-y-1.5 border border-line font-mono text-[11px]">
                            <div><strong className="text-ink">From:</strong> {senderDisplayName} &lt;{senderAddress}&gt;</div>
                            <div><strong className="text-ink">To:</strong> {recipientAddress}</div>
                            <div><strong className="text-ink">Date:</strong> {formatDetailDate(msg.sentAt || msg.createdAt)}</div>
                            <div><strong className="text-ink">Subject:</strong> {msg.subject}</div>
                            {msg.messageId && <div><strong className="text-ink">Message-ID:</strong> {msg.messageId}</div>}
                            <div className="flex items-center gap-1 text-green font-sans text-xs pt-1">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>Verified Transport via Google Workspace SMTP</span>
                            </div>
                          </div>
                        )}

                        {/* Email Body */}
                        <div className="mt-4 text-sm leading-relaxed text-ink whitespace-pre-wrap font-sans bg-canvas/70 p-4 rounded-xl border border-line/60">
                          {msg.body}
                        </div>

                        {/* Message Footer Status */}
                        <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs text-muted">
                          <div className="flex items-center gap-1.5">
                            {msg.status === "Sent" ? (
                              <span className="flex items-center gap-1 text-green font-semibold">
                                <Check className="h-3.5 w-3.5" /> Sent via Gmail SMTP
                              </span>
                            ) : msg.status === "Failed" ? (
                              <span className="flex items-center gap-1 text-danger font-semibold">
                                <AlertCircle className="h-3.5 w-3.5" /> Delivery failed
                              </span>
                            ) : (
                              <span>Status: {msg.status}</span>
                            )}
                          </div>
                          {msg.step !== undefined && (
                            <span className="text-[11px] text-muted font-mono">Sequence Step {msg.step}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Lead AI ICP Context Card */}
                {selectedEmail.lead && (
                  <div className="rounded-2xl border border-sage bg-green-soft/40 p-5 text-xs">
                    <div className="flex items-center justify-between gap-2 text-green font-bold mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-green" />
                        <span className="text-sm">Prospect Research & AI Profile</span>
                      </div>
                      <span className="rounded-full bg-sage text-green-dark px-2.5 py-0.5 text-[11px] font-bold">
                        {selectedEmail.lead.matchScore || 90}% ICP Match
                      </span>
                    </div>

                    {selectedEmail.lead.matchReason && (
                      <p className="text-ink leading-relaxed mb-3">
                        {selectedEmail.lead.matchReason}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-sage text-[11px] text-muted">
                      <div className="flex items-center gap-1.5 truncate">
                        <Building2 className="h-3.5 w-3.5 text-green shrink-0" />
                        <span className="truncate text-ink font-medium">{selectedEmail.lead.company || "Company"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <MessageSquare className="h-3.5 w-3.5 text-green shrink-0" />
                        <span className="truncate text-ink font-medium">{selectedEmail.lead.jobTitle || "Role"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <button
                          type="button"
                          onClick={() => handleCopyEmail(selectedEmail.recipientEmail)}
                          className="hover:text-green flex items-center gap-1 cursor-pointer truncate transition-colors"
                          title="Copy email"
                        >
                          <Copy className="h-3.5 w-3.5 text-green shrink-0" />
                          <span className="font-mono">{copiedEmail ? "Copied!" : selectedEmail.recipientEmail}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Gmail-Style Quick Reply Drawer */}
                <div className="pt-2">
                  {!showReplyBox ? (
                    <button
                      type="button"
                      onClick={() => setShowReplyBox(true)}
                      className="btn btn-primary !min-h-0 !py-2.5 !px-5 !text-xs !font-semibold cursor-pointer"
                    >
                      <CornerUpLeft className="h-4 w-4" />
                      <span>
                        Reply to{" "}
                        {selectedEmail.folder === "inbox"
                          ? selectedEmail.lead?.name || selectedEmail.senderName || selectedEmail.senderEmail
                          : selectedEmail.lead?.name || selectedEmail.recipientName || selectedEmail.recipientEmail}
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-line bg-white p-5 sm:p-6 shadow-sm">
                      <form onSubmit={handleSendReply} className="space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-line text-xs">
                          <span className="font-bold text-ink flex items-center gap-1.5 text-sm">
                            <CornerUpLeft className="h-4 w-4 text-green" /> Reply to{" "}
                            {selectedEmail.folder === "inbox"
                              ? selectedEmail.lead?.name || selectedEmail.senderName || selectedEmail.senderEmail
                              : selectedEmail.lead?.name || selectedEmail.recipientName || selectedEmail.recipientEmail}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowReplyBox(false)}
                            className="text-muted hover:text-ink cursor-pointer p-1 rounded-lg hover:bg-mist transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {replySuccess && (
                          <div className="rounded-xl bg-green-soft p-3.5 text-xs text-green-dark border border-sage flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green shrink-0" />
                            <span>Reply sent successfully and recorded in timeline.</span>
                          </div>
                        )}

                        {replyError && (
                          <div className="rounded-xl bg-red-50 p-3.5 text-xs text-danger border border-red-200 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-danger shrink-0" />
                            <span>{replyError}</span>
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold text-muted uppercase">Subject</label>
                          <input
                            type="text"
                            value={replySubject}
                            onChange={(e) => setReplySubject(e.target.value)}
                            placeholder="Subject"
                            className="w-full h-9 px-3 text-xs rounded-xl border border-line bg-canvas text-ink placeholder:text-muted focus:bg-white focus:border-green focus:ring-2 focus:ring-green/15 outline-none transition-all"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold text-muted uppercase">Message</label>
                          <textarea
                            rows={5}
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            placeholder={`Write your reply to ${
                              selectedEmail.folder === "inbox"
                                ? selectedEmail.lead?.name || selectedEmail.senderName || selectedEmail.senderEmail
                                : selectedEmail.lead?.name || selectedEmail.recipientName || selectedEmail.recipientEmail
                            }...`}
                            className="w-full p-3.5 text-xs rounded-xl border border-line bg-canvas text-ink placeholder:text-muted focus:bg-white focus:border-green focus:ring-2 focus:ring-green/15 outline-none resize-none leading-relaxed transition-all"
                            required
                          />
                        </div>

                        {/* Quick Response Templates */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-bold text-muted uppercase mr-1">Templates:</span>
                          {[
                            "Sounds great! Let's schedule a quick call.",
                            "Following up on my previous note.",
                            "Thank you for getting back to me.",
                          ].map((tmpl) => (
                            <button
                              key={tmpl}
                              type="button"
                              onClick={() => setReplyBody((prev) => (prev ? `${prev}\n\n${tmpl}` : tmpl))}
                              className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[11px] text-muted hover:bg-green-soft hover:text-green hover:border-sage cursor-pointer transition-colors"
                            >
                              + {tmpl}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-line">
                          <span className="text-[11px] text-muted">
                            Delivers via authenticated Gmail SMTP.
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowReplyBox(false)}
                              className="btn btn-secondary !min-h-0 !py-2 !px-3.5 !text-xs cursor-pointer"
                            >
                              Discard
                            </button>
                            <button
                              type="submit"
                              disabled={isSendingReply || !replyBody.trim()}
                              className="btn btn-primary !min-h-0 !py-2 !px-4 !text-xs !font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>{isSendingReply ? "Sending..." : "Send Reply"}</span>
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ------------------------------------------------------- */
            /* CASE 2: EMAIL LIST VIEW (Superhuman / Gmail Table)      */
            /* ------------------------------------------------------- */
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white">
              {/* Error Alert */}
              {error && (
                <div className="m-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => fetchEmails(true)}
                    className="font-bold underline hover:text-red-950 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Loading State */}
              {isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center p-16 text-center">
                  <RefreshCw className="h-7 w-7 animate-spin text-green" />
                  <p className="mt-3 text-xs font-semibold text-muted">Synchronizing inbox...</p>
                </div>
              )}

              {/* Empty State */}
              {!isLoading && filteredEmails.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center p-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-mist text-muted mb-3 border border-line">
                    {activeFolder === "inbox" ? (
                      <InboxIcon className="h-8 w-8 text-muted" />
                    ) : (
                      <Send className="h-8 w-8 text-muted" />
                    )}
                  </div>
                  <h3 className="text-base font-serif font-bold text-ink">
                    {activeFolder === "inbox" ? "Your inbox is clear" : "No sent outreach yet"}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                    {activeFolder === "inbox"
                      ? "Replies from prospects will automatically land here when campaigns are live."
                      : "When you launch a campaign or send outreach, all outbound messages are recorded here."}
                  </p>
                </div>
              )}

              {/* Email Table Header */}
              {!isLoading && filteredEmails.length > 0 && (
                <div className="border-b border-line bg-mist/60 px-4 py-2 flex items-center text-[10px] font-bold uppercase tracking-wider text-muted">
                  <div className="w-48 sm:w-56 shrink-0">Prospect / Contact</div>
                  <div className="flex-1 min-w-0">Subject & Outreach Preview</div>
                  <div className="shrink-0 w-32 text-right">Status & Date</div>
                </div>
              )}

              {/* Email List Table Rows */}
              {!isLoading && filteredEmails.length > 0 && (
                <div className="divide-y divide-line overflow-y-auto flex-1 min-h-0">
                  {filteredEmails.map((email) => {
                    const isUnread = email.isUnread;
                    const contactTitle =
                      activeFolder === "inbox"
                        ? email.lead?.name || email.senderName || email.senderEmail || email.recipientEmail
                        : `To: ${email.lead?.name || email.recipientName || email.recipientEmail}`;
                    const avatarGradient = getAvatarGradient(contactTitle);
                    const avatarInitial = (contactTitle.replace("To: ", "")[0] || "U").toUpperCase();

                    return (
                      <div
                        key={email.id}
                        onClick={() => handleOpenEmail(email)}
                        className={`group flex items-center gap-3.5 px-4 py-3.5 transition-all cursor-pointer select-none ${
                          isUnread
                            ? "bg-white font-bold text-ink hover:bg-green-soft/30 border-l-4 border-l-green"
                            : "bg-white text-ink hover:bg-mist/50"
                        }`}
                      >
                        {/* Avatar & Contact Column */}
                        <div className="w-48 sm:w-56 shrink-0 flex items-center gap-2.5 min-w-0">
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${avatarGradient} text-white font-bold text-xs shadow-2xs`}>
                            {avatarInitial}
                          </div>
                          <div className="truncate min-w-0">
                            <span className={`text-xs truncate block ${isUnread ? "font-bold text-ink" : "font-semibold text-ink"}`}>
                              {contactTitle}
                            </span>
                            {email.lead?.company && (
                              <span className="text-[10px] text-muted truncate block">
                                {email.lead.company}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Subject & Preview Column */}
                        <div className="flex-1 min-w-0 flex items-baseline gap-1.5 truncate text-xs">
                          <span className={`truncate ${isUnread ? "font-bold text-ink" : "font-medium text-ink"}`}>
                            {email.subject || "(No Subject)"}
                          </span>
                          <span className="text-muted truncate font-normal hidden md:inline">
                            — {email.preview || "No preview"}
                          </span>
                        </div>

                        {/* Status, Campaign & Timestamp Column */}
                        <div className="shrink-0 flex items-center gap-2">
                          {email.campaignName && (
                            <span className="hidden lg:inline-block rounded-md bg-mist border border-line/60 px-2 py-0.5 text-[10px] font-medium text-muted truncate max-w-[120px]">
                              {email.campaignName}
                            </span>
                          )}

                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              email.status === "Replied"
                                ? "bg-green-soft text-green border border-sage"
                                : email.status === "Meeting Booked"
                                ? "bg-gold-soft text-gold border border-amber-200"
                                : email.status === "Failed"
                                ? "bg-red-50 text-danger border border-red-200"
                                : "bg-mist text-muted border border-line"
                            }`}
                          >
                            {email.status}
                          </span>

                          <span className="text-[11px] font-medium text-muted w-16 text-right">
                            {formatListDate(email.date)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
