"use client";

import { Search, Send } from "lucide-react";

interface InboxModuleProps {
  launched?: boolean;
}

export default function InboxModule({ launched = false }: InboxModuleProps) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <p className="eyebrow">Reply management</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Inbox</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Conversations appear here after a live campaign receives replies.
        </p>
      </header>

      <section className="surface rounded-3xl p-8">
        <div className="relative max-w-md">
          <Search className="absolute top-3 left-3 h-4 w-4 text-muted" />
          <input className="input pl-9 text-sm" disabled placeholder="Search conversations" />
        </div>
        <div className="mt-8 rounded-2xl bg-canvas px-6 py-16 text-center">
          <Send className="mx-auto h-8 w-8 text-green" />
          <h2 className="mt-4 text-xl font-bold">No conversations yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {launched
              ? "Your campaign is live. Replies will show here when prospects respond."
              : "Launch a campaign first. This inbox stays empty until real replies arrive."}
          </p>
        </div>
      </section>
    </div>
  );
}
