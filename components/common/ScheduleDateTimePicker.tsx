"use client";

import React, { useState } from "react";
import { Calendar as CalendarIcon, Check, X } from "lucide-react";

export interface ScheduleDateTimePickerProps {
  initialDate?: string;
  minDate?: string;
  onApply: (dateIso: string) => void;
  onCancel: () => void;
  title?: string;
  subtitle?: string;
}

export default function ScheduleDateTimePicker({
  initialDate,
  minDate,
  onApply,
  onCancel,
  title = "Select Date & Time",
  subtitle = "Choose when this follow-up email should be sent",
}: ScheduleDateTimePickerProps) {
  const defaultMin = minDate ? new Date(minDate) : new Date();
  const initDateObj = initialDate ? new Date(initialDate) : new Date(defaultMin.getTime() + 24 * 60 * 60 * 1000);

  const [date, setDate] = useState<string>(() => {
    try {
      return initDateObj.toISOString().split("T")[0];
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  });

  const [time, setTime] = useState<string>(() => {
    try {
      const hours = String(initDateObj.getHours()).padStart(2, "0");
      const minutes = String(initDateObj.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    } catch {
      return "09:00";
    }
  });

  const [error, setError] = useState("");

  const minDateStr = (() => {
    try {
      return defaultMin.toISOString().split("T")[0];
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  })();

  const handleApply = () => {
    if (!date) {
      setError("Please select a valid date.");
      return;
    }
    const combined = new Date(`${date}T${time || "09:00"}:00`);
    if (isNaN(combined.getTime())) {
      setError("Invalid date/time combination.");
      return;
    }
    if (minDate && combined.getTime() < new Date(minDate).getTime()) {
      setError("Scheduled time must be after the previous email step.");
      return;
    }
    setError("");
    onApply(combined.toISOString());
  };

  const setPresetDays = (days: number) => {
    const base = minDate ? new Date(minDate) : new Date();
    const target = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    setDate(target.toISOString().split("T")[0]);
    setTime("09:00");
    setError("");
  };

  return (
    <div className="mt-3 rounded-2xl border border-line bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-green/10 flex items-center justify-center text-green">
            <CalendarIcon className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-ink">{title}</h4>
            <p className="text-[11px] text-muted">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted hover:text-ink cursor-pointer p-1 rounded-md hover:bg-mist"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Presets */}
      <div>
        <span className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-1.5">
          Quick relative presets
        </span>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "+2 days", days: 2 },
            { label: "+3 days", days: 3 },
            { label: "+5 days", days: 5 },
            { label: "+1 week (7d)", days: 7 },
            { label: "+10 days", days: 10 },
            { label: "+2 weeks (14d)", days: 14 },
          ].map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => setPresetDays(preset.days)}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-line bg-canvas hover:bg-green-soft hover:border-green hover:text-green-dark cursor-pointer transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date & Time Input Row */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-ink block mb-1">Date</label>
          <div className="relative">
            <input
              type="date"
              value={date}
              min={minDateStr}
              onChange={(e) => {
                setDate(e.target.value);
                setError("");
              }}
              className="input text-xs font-semibold w-full"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-ink block mb-1">Time</label>
          <div className="relative">
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setError("");
              }}
              className="input text-xs font-semibold w-full"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 font-medium">
          {error}
        </p>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-line/60">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary text-xs cursor-pointer py-1.5 px-3"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="btn btn-primary text-xs cursor-pointer py-1.5 px-3.5 flex items-center gap-1.5"
        >
          <Check className="h-3.5 w-3.5" />
          <span>Save Schedule</span>
        </button>
      </div>
    </div>
  );
}
