"use client";

import { useState } from "react";
import type { Lead } from "../../types";
import LeadManagementView from "../leads/LeadManagementView";

interface LeadsModuleProps {
  leads: Lead[];
  connectedEmail?: string;
  initialSelectedIds?: string[];
  onSendMail?: (selectedLeads: Lead[]) => void;
}

export default function LeadsModule({ leads, connectedEmail, initialSelectedIds, onSendMail }: LeadsModuleProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelectedIds && initialSelectedIds.length > 0 ? initialSelectedIds : leads.map((l) => l.id)),
  );
  const [feedback, setFeedback] = useState("");

  const toggleLead = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleContinue = () => {
    const selectedLeads = leads.filter((lead) => selectedIds.has(lead.id));
    if (!selectedLeads.length) {
      setFeedback("Select at least one lead before continuing.");
      return;
    }
    setFeedback("");
    onSendMail?.(selectedLeads);
  };

  return (
    <div className="w-full space-y-5">
      <div>
        <p className="eyebrow">Workplace · Leads</p>
        <h1 className="font-serif text-2xl font-bold text-ink">All generated leads</h1>
        <p className="mt-1 text-sm text-muted">Search and filter the loaded lead list. One lead is shown per row.</p>
      </div>

      {connectedEmail && (
        <div className="rounded-2xl border border-green/20 bg-green-soft p-4 text-sm text-green-dark">
          <strong>Saved sending email:</strong> {connectedEmail}
        </div>
      )}
      {feedback && (
        <div className="rounded-2xl border border-line bg-white p-4 text-sm text-ink" role="status">
          {feedback}
        </div>
      )}

      <LeadManagementView
        leads={leads}
        selectedLeadIds={selectedIds}
        onToggleLead={toggleLead}
        onSelectAll={(ids = leads.map((lead) => lead.id)) => setSelectedIds(new Set(ids))}
        onClearAll={() => setSelectedIds(new Set())}
        onContinue={handleContinue}
        continueLabel="Review email sequence"
      />
    </div>
  );
}
