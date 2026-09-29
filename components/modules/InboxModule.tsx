"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Inbox as InboxIcon,
  Search,
  Send,
  RefreshCw,
  Mail,
  User,
  Building2,
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  MapPin,
  Briefcase,
  Layers,
  Check,
  RotateCcw,
} from "lucide-react";
import type { InboxConversation, InboxMessage } from "@/app/api/inbox/route";

interface InboxModuleProps {
  launched?: boolean;
  onNavigate?: (module: string) => void;
  connectedEmail?: string;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatExactDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString(undefined, {
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

export default function InboxModule({
  launched = false,
  onNavigate,
  connectedEmail,
}: InboxModuleProps) {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [stats, setStats] = useState({
    totalConversations: 0,
    totalSent: 0,
    totalFailed: 0,
    repliedCount: 0,
    meetingsCount: 0,
    connectedAccountsCount: 0,
  });
  const [connectedAccounts, setConnectedAccounts] = useState<
    { id: string; email: string; displayName: string }[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  // Reply Composer State
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Fetch real inbox data from backend API
  const fetchInbox = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load inbox (HTTP ${res.status})`);
      }
      const data = await res.json();
      setConversations(data.conversations || []);
      if (data.stats) setStats(data.stats);
      if (data.connectedAccounts) setConnectedAccounts(data.connectedAccounts);

      // Auto-select first conversation if none selected
      setSelectedConversationId((prev) => prev || (data.conversations?.length > 0 ? data.conversations[0].id : null));
    } catch (err) {
      console.error("[InboxModule] Load error:", err);
      setError(err instanceof Error ? err.message : "Unable to load inbox conversations.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/inbox", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load inbox (HTTP ${res.status})`);
        const data = await res.json();
        if (isMounted) {
          setConversations(data.conversations || []);
          if (data.stats) setStats(data.stats);
          if (data.connectedAccounts) setConnectedAccounts(data.connectedAccounts);
          setSelectedConversationId((prev) => prev || (data.conversations?.length > 0 ? data.conversations[0].id : null));
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load inbox conversations.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // Selected conversation object
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === selectedConversationId) || null;
  }, [conversations, selectedConversationId]);

  const defaultSubject = useMemo(() => {
    if (!activeConversation || activeConversation.messages.length === 0) return "";
    const lastMsg = activeConversation.messages[activeConversation.messages.length - 1];
    const prevSubject = lastMsg.subject || "";
    return prevSubject.startsWith("Re:") ? prevSubject : `Re: ${prevSubject}`;
  }, [activeConversation]);

  // Current reply subject (controlled or derived)
  const currentReplySubject = replySubject !== "" ? replySubject : defaultSubject;

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setReplySubject("");
    setReplyBody("");
    setReplyError(null);
    setReplySuccess(false);
  };

  // Extract unique campaign names for filtering
  const availableCampaigns = useMemo(() => {
    const names = new Set<string>();
    conversations.forEach((c) => {
      if (c.campaignName) names.add(c.campaignName);
    });
    return Array.from(names);
  }, [conversations]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = c.lead.name?.toLowerCase().includes(query);
        const matchesEmail = c.recipient?.toLowerCase().includes(query);
        const matchesCompany = c.lead.company?.toLowerCase().includes(query);
        const matchesSubject = c.messages.some((m) => m.subject?.toLowerCase().includes(query));
        const matchesBody = c.messages.some((m) => m.body?.toLowerCase().includes(query));

        if (!matchesName && !matchesEmail && !matchesCompany && !matchesSubject && !matchesBody) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === "replied" && c.status !== "Replied") return false;
      if (statusFilter === "meetings" && c.status !== "Meeting Booked") return false;
      if (statusFilter === "contacted" && c.status !== "Contacted" && c.status !== "Sending") return false;
      if (statusFilter === "failed" && c.status !== "Failed") return false;

      // Campaign filter
      if (campaignFilter !== "all" && c.campaignName !== campaignFilter) return false;

      return true;
    });
  }, [conversations, searchQuery, statusFilter, campaignFilter]);

  // Handle sending reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversation || !replyBody.trim()) return;

    setIsSendingReply(true);
    setReplyError(null);
    setReplySuccess(false);

    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: activeConversation.recipient,
          subject: currentReplySubject.trim() || "Follow up",
          body: replyBody.trim(),
          campaignId: activeConversation.campaignId,
          leadId: activeConversation.leadId,
          senderEmail: activeConversation.senderEmail || connectedEmail || connectedAccounts[0]?.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send email reply.");
      }

      setReplySuccess(true);
      setReplyBody("");

      // Optimistically append message to conversation list
      if (data.delivery) {
        const newMessage: InboxMessage = {
          id: data.delivery.id,
          direction: "outbound",
          senderEmail: data.delivery.senderEmail,
          recipient: data.delivery.recipient,
          subject: data.delivery.subject,
          body: data.delivery.body,
          status: "Sent",
          messageId: data.delivery.messageId,
          sentAt: data.delivery.sentAt,
          createdAt: data.delivery.createdAt,
        };

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === activeConversation.id) {
              return {
                ...c,
                status: "Contacted",
                lastMessageAt: data.delivery.sentAt || new Date().toISOString(),
                lastMessagePreview: data.delivery.body.slice(0, 120),
                messages: [...c.messages, newMessage],
              };
            }
            return c;
          })
        );
      }

      // Re-fetch in background to ensure sync
      fetchInbox();
    } catch (err) {
      console.error("[InboxModule] Reply error:", err);
      setReplyError(err instanceof Error ? err.message : "Failed to send email reply.");
    } finally {
      setIsSendingReply(false);
    }
  };

  // Handle changing conversation / lead status
  const handleUpdateStatus = async (newStatus: "Contacted" | "Replied" | "Meeting Booked") => {
    if (!activeConversation) return;
    setUpdatingStatus(true);

    try {
      const res = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: activeConversation.leadId,
          recipient: activeConversation.recipient,
          status: newStatus,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update status");
      }

      // Update local state
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConversation.id) {
            return {
              ...c,
              status: newStatus,
              lead: { ...c.lead, status: newStatus },
            };
          }
          return c;
        })
      );
    } catch (err) {
      console.error("[InboxModule] Status update error:", err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Header Section */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <InboxIcon className="h-3.5 w-3.5 text-green" /> Reply management
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-ink">Inbox</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Live outreach history, sent sequences, and prospect conversations across your campaigns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchInbox(true)}
            disabled={isRefreshing || isLoading}
            className="btn btn-secondary flex items-center gap-2 text-xs font-semibold cursor-pointer disabled:opacity-50"
            title="Refresh inbox"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-green" : ""}`} />
            <span>{isRefreshing ? "Syncing..." : "Sync Inbox"}</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate("campaign")}
              className="btn btn-primary flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <span>Campaigns</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface flex items-center gap-3.5 rounded-2xl p-4 border border-line">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green/10 text-green">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-xs font-medium text-muted">Total Outreach</span>
            <strong className="text-xl font-bold text-ink">{stats.totalSent}</strong>
          </div>
        </div>

        <div className="surface flex items-center gap-3.5 rounded-2xl p-4 border border-line">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-xs font-medium text-muted">Conversations</span>
            <strong className="text-xl font-bold text-ink">{stats.totalConversations}</strong>
          </div>
        </div>

        <div className="surface flex items-center gap-3.5 rounded-2xl p-4 border border-line">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-xs font-medium text-muted">Replies</span>
            <strong className="text-xl font-bold text-ink">{stats.repliedCount}</strong>
          </div>
        </div>

        <div className="surface flex items-center gap-3.5 rounded-2xl p-4 border border-line">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-xs font-medium text-muted">Meetings Booked</span>
            <strong className="text-xl font-bold text-ink">{stats.meetingsCount}</strong>
          </div>
        </div>
      </div>

      {/* Main Inbox Container */}
      <div className="surface rounded-3xl border border-line overflow-hidden shadow-sm">
        {/* Filter & Search Bar */}
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between bg-mist/20">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by prospect, company, subject, or message..."
              className="input pl-9 text-xs w-full bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute top-2.5 right-3 text-xs text-muted hover:text-ink cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Tabs */}
            <div className="inline-flex rounded-xl bg-canvas p-1 border border-line text-xs font-semibold">
              {[
                { id: "all", label: "All", count: conversations.length },
                { id: "contacted", label: "Contacted", count: stats.totalSent },
                { id: "replied", label: "Replied", count: stats.repliedCount },
                { id: "meetings", label: "Meetings", count: stats.meetingsCount },
                ...(stats.totalFailed > 0
                  ? [{ id: "failed", label: "Issues", count: stats.totalFailed }]
                  : []),
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                    statusFilter === tab.id
                      ? "bg-white text-ink font-bold shadow-xs"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                        statusFilter === tab.id
                          ? "bg-green/10 text-green font-bold"
                          : "bg-mist text-muted"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Campaign Dropdown Filter */}
            {availableCampaigns.length > 1 && (
              <select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                className="input py-1 px-2.5 text-xs bg-white border border-line rounded-xl"
              >
                <option value="all">All Campaigns</option>
                {availableCampaigns.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="m-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => fetchInbox(true)}
              className="font-bold underline hover:text-red-950 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="p-16 text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-green" />
            <p className="mt-3 text-sm font-semibold text-muted">Loading inbox conversations...</p>
          </div>
        )}

        {/* Empty State when no conversations exist at all */}
        {!isLoading && conversations.length === 0 && (
          <div className="p-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-green/10 text-green">
              <Send className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-ink">No conversations yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              {launched
                ? "Your campaign is active. Real conversations and sent outreach will appear here as emails are delivered."
                : "Launch a campaign to start outreach. Sent messages and replies will automatically display in this inbox."}
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate("campaign")}
                className="btn btn-primary mt-6 inline-flex items-center gap-2 text-xs font-semibold cursor-pointer"
              >
                <Mail className="h-4 w-4" /> Go to Campaigns
              </button>
            )}
          </div>
        )}

        {/* Split View Content */}
        {!isLoading && conversations.length > 0 && (
          <div className="grid min-h-[620px] grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-line">
            {/* Left Pane: Conversation List */}
            <div
              className={`lg:col-span-4 xl:col-span-5 flex flex-col ${
                selectedConversationId && activeConversation ? "hidden lg:flex" : "flex"
              }`}
            >
              <div className="border-b border-line bg-canvas/40 px-4 py-2.5 text-[11px] font-semibold text-muted flex items-center justify-between">
                <span>{filteredConversations.length} CONVERSATIONS</span>
                <span className="text-[10px] text-muted">Real-time sync</span>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-line max-h-[680px]">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted">
                    No conversations match your search or active filter.
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isSelected = conv.id === selectedConversationId;
                    const initial = (conv.lead.name?.[0] || conv.recipient[0] || "C").toUpperCase();
                    const lastMsg = conv.messages[conv.messages.length - 1];

                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => handleSelectConversation(conv.id)}
                        className={`w-full text-left p-4 transition-all cursor-pointer flex gap-3.5 items-start ${
                          isSelected
                            ? "bg-green-soft/40 border-l-4 border-l-green"
                            : "hover:bg-mist/40 bg-white"
                        }`}
                      >
                        {/* Avatar */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sage/30 text-green font-bold text-sm">
                          {initial}
                        </div>

                        {/* Summary Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-sm font-bold text-ink">
                              {conv.lead.name || conv.recipient}
                            </span>
                            <span className="shrink-0 text-[10px] font-medium text-muted">
                              {formatRelativeTime(conv.lastMessageAt)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{conv.lead.company || "Company"}</span>
                            {conv.lead.jobTitle && (
                              <>
                                <span className="text-mist">•</span>
                                <span className="truncate">{conv.lead.jobTitle}</span>
                              </>
                            )}
                          </div>

                          {/* Subject & Preview */}
                          <p className="mt-1 text-xs font-semibold text-ink/90 truncate">
                            {lastMsg?.subject || "Outreach"}
                          </p>
                          <p className="text-xs text-muted line-clamp-1 mt-0.5">
                            {conv.lastMessagePreview || "No message preview"}
                          </p>

                          {/* Badges */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span
                              className={`status text-[10px] py-0.5 px-2 ${
                                conv.status === "Replied"
                                  ? "good"
                                  : conv.status === "Meeting Booked"
                                  ? "good bg-purple-50 text-purple-700 border-purple-200"
                                  : conv.status === "Failed"
                                  ? "bad"
                                  : "bg-mist text-ink"
                              }`}
                            >
                              {conv.status}
                            </span>

                            {conv.campaignName && (
                              <span className="rounded-md bg-mist/60 px-1.5 py-0.5 text-[10px] text-muted truncate max-w-[130px]">
                                {conv.campaignName}
                              </span>
                            )}
                          </div>
                        </div>

                        <ChevronRight className={`h-4 w-4 shrink-0 text-muted mt-2 ${isSelected ? "text-green" : ""}`} />
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Pane: Conversation Details & Message Thread */}
            <div
              className={`lg:col-span-8 xl:col-span-7 flex flex-col bg-white ${
                !selectedConversationId || !activeConversation ? "hidden lg:flex" : "flex"
              }`}
            >
              {activeConversation ? (
                <>
                  {/* Lead & Conversation Header */}
                  <div className="border-b border-line p-4 sm:p-5 flex flex-col gap-3 bg-canvas/30">
                    <div className="flex items-center justify-between gap-2">
                      {/* Back button on mobile */}
                      <button
                        type="button"
                        onClick={() => setSelectedConversationId(null)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink lg:hidden cursor-pointer"
                      >
                        <ChevronLeft className="h-4 w-4" /> All Conversations
                      </button>

                      {/* Status Action Dropdown */}
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-xs text-muted hidden sm:inline">Status:</span>
                        <div className="inline-flex rounded-xl bg-white p-0.5 border border-line shadow-2xs text-xs">
                          {(["Contacted", "Replied", "Meeting Booked"] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              disabled={updatingStatus}
                              onClick={() => handleUpdateStatus(st)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                                activeConversation.status === st
                                  ? "bg-green text-white"
                                  : "text-muted hover:text-ink"
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green/10 text-green font-bold text-lg">
                          {(activeConversation.lead.name?.[0] || activeConversation.recipient[0] || "C").toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-ink">
                              {activeConversation.lead.name || activeConversation.recipient}
                            </h2>
                            <span
                              className={`status text-[10px] py-0.5 px-2 ${
                                activeConversation.status === "Replied"
                                  ? "good"
                                  : activeConversation.status === "Meeting Booked"
                                  ? "good bg-purple-50 text-purple-700 border-purple-200"
                                  : activeConversation.status === "Failed"
                                  ? "bad"
                                  : "bg-mist text-ink"
                              }`}
                            >
                              {activeConversation.status}
                            </span>
                          </div>

                          <p className="text-xs text-muted flex flex-wrap items-center gap-2 mt-0.5">
                            <span>{activeConversation.lead.jobTitle || "Contact"}</span>
                            <span>•</span>
                            <span>{activeConversation.lead.company || "Company"}</span>
                            <span>•</span>
                            <span className="font-mono text-ink/80">{activeConversation.recipient}</span>
                          </p>
                        </div>
                      </div>

                      {activeConversation.campaignName && (
                        <div className="rounded-xl border border-sage/50 bg-green-soft/40 px-3 py-1.5 text-right shrink-0">
                          <span className="block text-[10px] uppercase font-bold text-muted">Campaign</span>
                          <span className="block text-xs font-semibold text-ink truncate max-w-[180px]">
                            {activeConversation.campaignName}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Prospect ICP Research Context Pill */}
                    {activeConversation.lead.matchReason && (
                      <div className="mt-1 flex items-start gap-2 rounded-xl bg-mist/50 p-2.5 text-xs text-muted border border-line">
                        <Sparkles className="h-4 w-4 shrink-0 text-green mt-0.5" />
                        <div className="flex-1">
                          <strong className="text-ink font-semibold">ICP Match ({activeConversation.lead.matchScore || 90}%): </strong>
                          <span>{activeConversation.lead.matchReason}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Messages Timeline */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-h-[420px] bg-canvas/20">
                    {activeConversation.messages.map((msg, index) => {
                      const isOutbound = msg.direction === "outbound";

                      return (
                        <div
                          key={msg.id || index}
                          className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-xs ${
                            isOutbound
                              ? "bg-white border-line ml-0 md:ml-4"
                              : "bg-green-soft/30 border-sage mr-0 md:mr-4"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-line/60 pb-3 text-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-md px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider ${
                                  isOutbound ? "bg-mist text-ink" : "bg-green text-white"
                                }`}
                              >
                                {isOutbound ? "Outbound Email" : "Inbound Reply"}
                              </span>
                              <span className="font-semibold text-ink">
                                {isOutbound ? `From: ${msg.senderEmail}` : `From: ${msg.recipient}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-muted">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatExactDateTime(msg.sentAt || msg.createdAt)}</span>
                            </div>
                          </div>

                          {/* Subject */}
                          <div className="mt-3">
                            <span className="text-xs font-bold text-ink">Subject: </span>
                            <span className="text-xs font-semibold text-ink/90">{msg.subject}</span>
                          </div>

                          {/* Email Body */}
                          <div className="mt-3 text-xs leading-relaxed text-ink/80 whitespace-pre-wrap font-sans bg-canvas/30 p-3 rounded-xl border border-line/40">
                            {msg.body}
                          </div>

                          {/* Message Footer / Status */}
                          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                            <div className="flex items-center gap-1.5">
                              {msg.status === "Sent" ? (
                                <span className="flex items-center gap-1 text-green font-semibold">
                                  <Check className="h-3.5 w-3.5" /> Sent via Gmail SMTP
                                </span>
                              ) : msg.status === "Failed" ? (
                                <span className="flex items-center gap-1 text-red-600 font-semibold">
                                  <AlertCircle className="h-3.5 w-3.5" /> Delivery failed
                                </span>
                              ) : (
                                <span>Status: {msg.status}</span>
                              )}
                            </div>

                            {msg.step !== undefined && (
                              <span className="text-[10px] text-muted">Step {msg.step}</span>
                            )}
                          </div>

                          {/* Error Banner if send failed */}
                          {msg.error && (
                            <div className="mt-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
                              <strong>Delivery Error:</strong> {msg.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Reply Composer Form */}
                  <div className="border-t border-line p-4 sm:p-5 bg-white">
                    <form onSubmit={handleSendReply} className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-ink flex items-center gap-1.5">
                          <Send className="h-3.5 w-3.5 text-green" /> Quick Reply
                        </span>
                        <span className="text-muted text-[11px]">
                          Sending via:{" "}
                          <strong className="text-ink">
                            {activeConversation.senderEmail || connectedEmail || "Connected Gmail"}
                          </strong>
                        </span>
                      </div>

                      {replySuccess && (
                        <div className="flex items-center gap-2 rounded-xl bg-green-soft p-3 text-xs text-green-dark border border-sage">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>Reply sent successfully and recorded in outbound history.</span>
                        </div>
                      )}

                      {replyError && (
                        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{replyError}</span>
                        </div>
                      )}

                      <div>
                        <input
                          type="text"
                          value={currentReplySubject}
                          onChange={(e) => setReplySubject(e.target.value)}
                          placeholder="Subject"
                          className="input text-xs w-full mb-2 bg-canvas/30"
                          required
                        />
                        <textarea
                          rows={3}
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          placeholder={`Write a direct reply to ${activeConversation.lead.name || activeConversation.recipient}...`}
                          className="input text-xs w-full resize-none p-3 bg-canvas/30"
                          required
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-muted">
                          Uses authenticated Gmail SMTP and records in timeline.
                        </span>
                        <button
                          type="submit"
                          disabled={isSendingReply || !replyBody.trim()}
                          className="btn btn-primary flex items-center gap-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{isSendingReply ? "Sending reply..." : "Send Reply"}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
                  <Mail className="h-10 w-10 text-mist mb-3" />
                  <p className="text-sm font-semibold text-ink">Select a conversation</p>
                  <p className="text-xs max-w-sm mt-1 text-muted">
                    Choose a conversation from the left to view the complete outreach thread and reply directly.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
