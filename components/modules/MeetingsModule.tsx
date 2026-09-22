"use client";

import { CalendarCheck } from "lucide-react";

interface MeetingsModuleProps {
  launched?: boolean;
}

export default function MeetingsModule({ launched = false }: MeetingsModuleProps) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <p className="eyebrow">Revenue moments</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Meetings</h1>
        <p className="mt-2 text-sm text-muted">Confirmed intro calls will appear here once they are booked.</p>
      </header>
      <section className="surface rounded-3xl p-8">
        <div className="rounded-2xl bg-canvas px-6 py-16 text-center">
          <CalendarCheck className="mx-auto h-8 w-8 text-green" />
          <h2 className="mt-4 text-xl font-bold">No meetings scheduled</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {launched
              ? "Meetings will list here after a prospect books time from a live campaign."
              : "Launch a campaign and wait for confirmed bookings. Nothing is scheduled yet."}
          </p>
        </div>
      </section>
    </div>
  );
}
