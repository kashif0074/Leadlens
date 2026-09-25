"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
import type { Lead } from "../../types";

type SequenceItem = {
  label: string;
  subject: string;
  body: string;
  schedule: string;
};

interface EmailSequenceModuleProps {
  leads: Lead[];
  provider?: string;
  sequence?: Array<{ step?: number; delayDays?: number; subject: string; body: string }>;
  onBack: () => void;
  onContinue: () => void;
}

const fallbackSequence: SequenceItem[] = [
  {
    label: "First Email",
    subject: "Quick question regarding your pipeline",
    body: "Hi {{first_name}},\n\nI noticed {{company}} is expanding. We help teams build a healthier, more qualified outbound pipeline.\n\nWould a brief introduction be useful?",
    schedule: "Send immediately after launch",
  },
  {
    label: "Follow-up 1",
    subject: "Re: Quick question regarding your pipeline",
    body: "Hi {{first_name}},\n\nFollowing up in case this is relevant to your current growth plans. Happy to share a short example of the workflow.",
    schedule: "3 days after First Email",
  },
  {
    label: "Follow-up 2",
    subject: "A practical idea for {{company}}",
    body: "One practical idea: start with the accounts already showing an expansion signal, then keep the cadence considerate and measurable.",
    schedule: "5 days after Follow-up 1",
  },
];

export default function EmailSequenceModule({
  leads,
  provider,
  sequence: customSequence,
  onBack,
  onContinue,
}: EmailSequenceModuleProps) {
  const [sequence, setSequence] = useState<SequenceItem[]>(() => {
    if (customSequence && customSequence.length > 0) {
      return customSequence.map((item, index) => ({
        label: index === 0 ? "First Email" : `Follow-up ${index}`,
        subject: item.subject,
        body: item.body,
        schedule: index === 0 ? "Send immediately after launch" : `${item.delayDays || (index === 1 ? 3 : 5)} days after previous email`,
      }));
    }
    return fallbackSequence;
  });
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const updateItem = (index: number, field: "subject" | "body", value: string) => {
    setSequence((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Email campaign workflow</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">Review the sequence before launch.</h1>
          <p className="mt-2 text-sm text-muted">
            {leads.length} recipients · {provider || "sending inbox not saved yet"}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to leads
        </button>
      </div>

      <div className="space-y-4">
        {sequence.map((item, index) => (
          <article key={item.label} className="surface panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <span className="status good">{item.label}</span>
                <p className="mt-2 text-xs font-semibold text-muted">{item.schedule}</p>
              </div>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => setEditing(editing === index ? null : index)}>
                <Pencil className="h-3.5 w-3.5" /> {editing === index ? "Done editing" : "Edit email"}
              </button>
            </div>
            {editing === index ? (
              <div className="grid gap-4 pt-4">
                <label className="text-sm font-semibold">
                  Subject
                  <input className="input mt-2" value={item.subject} onChange={(event) => updateItem(index, "subject", event.target.value)} />
                </label>
                <label className="text-sm font-semibold">
                  Email body
                  <textarea className="input mt-2 min-h-32" value={item.body} onChange={(event) => updateItem(index, "body", event.target.value)} />
                </label>
              </div>
            ) : (
              <div className="grid gap-5 pt-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
                <div>
                  <p className="text-xs font-bold tracking-wider text-muted uppercase">Subject</p>
                  <p className="mt-2 font-semibold">{item.subject}</p>
                  <p className="mt-5 text-xs font-bold tracking-wider text-muted uppercase">Recipients</p>
                  <p className="mt-2 text-sm">{leads.length} selected leads</p>
                  <p className="mt-1 text-xs text-muted">
                    {leads
                      .slice(0, 3)
                      .map((lead) => lead.name)
                      .join(", ")}
                    {leads.length > 3 ? " and more" : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold tracking-wider text-muted uppercase">Email body</p>
                  <p className="mt-2 whitespace-pre-line rounded-xl bg-mist p-4 text-sm leading-relaxed">{item.body}</p>
                </div>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
              <CheckCircle2 className="h-4 w-4 text-green" /> {saved ? "Sequence saved as draft" : "Draft · not sent"}
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => setSaved(true)}>
          Save sequence draft
        </button>
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          Continue to campaign setup
        </button>
      </div>
    </div>
  );
}
