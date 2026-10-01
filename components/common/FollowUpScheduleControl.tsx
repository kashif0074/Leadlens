"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Calendar, RotateCcw } from "lucide-react";
import ScheduleDateTimePicker from "./ScheduleDateTimePicker";

export type FollowUpSequenceItem = {
  step?: number;
  delayDays?: number;
  intervalDays?: number;
  scheduledAt?: string | null;
  scheduledTime?: string;
  scheduleMode?: "default" | "custom";
  customSendAt?: string;
  subject: string;
  body: string;
  manuallyEdited?: boolean;
  [key: string]: unknown;
};

export interface FollowUpScheduleControlProps {
  stepIndex: 1 | 2; // 1 for Follow-up 1, 2 for Follow-up 2
  sequence: FollowUpSequenceItem[];
  onUpdateSequence: (newSequence: FollowUpSequenceItem[]) => void;
  disabled?: boolean;
}

export function formatReadableDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function computeFollowUp1Date(sequence: FollowUpSequenceItem[]): Date {
  const fu1 = sequence[1];
  if (fu1?.scheduleMode === "custom" && fu1?.customSendAt) {
    const custom = new Date(fu1.customSendAt);
    if (!isNaN(custom.getTime())) return custom;
  }
  const days = fu1?.intervalDays ?? fu1?.delayDays ?? 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function computeFollowUp2Date(sequence: FollowUpSequenceItem[]): Date {
  const fu2 = sequence[2];
  if (fu2?.scheduleMode === "custom" && fu2?.customSendAt) {
    const custom = new Date(fu2.customSendAt);
    if (!isNaN(custom.getTime())) return custom;
  }
  const fu1Date = computeFollowUp1Date(sequence);
  const interval = fu2?.intervalDays ?? 3;
  return new Date(fu1Date.getTime() + interval * 24 * 60 * 60 * 1000);
}

export default function FollowUpScheduleControl({
  stepIndex,
  sequence,
  onUpdateSequence,
  disabled = false,
}: FollowUpScheduleControlProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const currentItem = sequence[stepIndex] || {
    step: stepIndex + 1,
    delayDays: stepIndex === 1 ? 7 : 10,
    intervalDays: stepIndex === 1 ? 7 : 3,
    scheduleMode: "default",
    subject: "",
    body: "",
  };

  const isCustom = currentItem.scheduleMode === "custom" && Boolean(currentItem.customSendAt);

  // Compute calculated dates
  const fu1Date = useMemo(() => computeFollowUp1Date(sequence), [sequence]);
  const fu2Date = useMemo(() => computeFollowUp2Date(sequence), [sequence]);

  const defaultScheduleText =
    stepIndex === 1
      ? "Default schedule: 1 week from now"
      : "Default schedule: 3 days after Follow-up 1's date";

  const targetDateDisplay =
    stepIndex === 1
      ? formatReadableDateTime(fu1Date.toISOString())
      : formatReadableDateTime(fu2Date.toISOString());

  const minDateForPicker = useMemo(() => {
    return stepIndex === 1 ? new Date().toISOString() : fu1Date.toISOString();
  }, [stepIndex, fu1Date]);

  const handleApplyCustom = useCallback((dateIso: string) => {
    const now = Date.now();
    const chosenTime = new Date(dateIso).getTime();
    const totalDaysFromNow = Math.max(1, Math.round((chosenTime - now) / (24 * 60 * 60 * 1000)));

    const updated = sequence.map((item, idx) => {
      if (idx === stepIndex) {
        let intervalDays = totalDaysFromNow;
        if (stepIndex === 2) {
          const fu1Time = fu1Date.getTime();
          intervalDays = Math.max(1, Math.round((chosenTime - fu1Time) / (24 * 60 * 60 * 1000)));
        }
        return {
          ...item,
          scheduleMode: "custom" as const,
          customSendAt: dateIso,
          scheduledAt: dateIso,
          delayDays: totalDaysFromNow,
          intervalDays,
        };
      }
      return item;
    });

    onUpdateSequence(updated);
    setIsPickerOpen(false);
  }, [sequence, stepIndex, fu1Date, onUpdateSequence]);

  const handleResetToDefault = useCallback(() => {
    const updated = sequence.map((item, idx) => {
      if (idx === stepIndex) {
        const defaultDays = stepIndex === 1 ? 7 : 10;
        const defaultInterval = stepIndex === 1 ? 7 : 3;
        return {
          ...item,
          scheduleMode: "default" as const,
          customSendAt: undefined,
          scheduledAt: null,
          scheduledTime: undefined,
          delayDays: defaultDays,
          intervalDays: defaultInterval,
        };
      }
      return item;
    });

    onUpdateSequence(updated);
    setIsPickerOpen(false);
  }, [sequence, stepIndex, onUpdateSequence]);

  return (
    <div className="mt-3.5 rounded-xl border border-line bg-canvas/70 p-3 text-xs text-ink transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-green/10 flex items-center justify-center text-green shrink-0">
            <Calendar className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-ink">
                {isCustom ? "Custom schedule:" : defaultScheduleText}
              </span>
              <span className="text-muted font-medium">({targetDateDisplay})</span>
              {isCustom && (
                <span className="text-[10px] font-bold bg-green-soft text-green px-2 py-0.5 rounded-full">
                  Custom
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCustom && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleResetToDefault}
              className="text-muted hover:text-ink text-[11px] font-medium flex items-center gap-1 cursor-pointer hover:underline disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset to default</span>
            </button>
          )}

          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsPickerOpen((prev) => !prev)}
            className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Calendar className="h-3.5 w-3.5 text-green" />
            <span>{isPickerOpen ? "Close Calendar" : isCustom ? "Change schedule" : "Set custom schedule"}</span>
          </button>
        </div>
      </div>

      {isPickerOpen && (
        <ScheduleDateTimePicker
          initialDate={isCustom ? currentItem.customSendAt : (stepIndex === 1 ? fu1Date.toISOString() : fu2Date.toISOString())}
          minDate={minDateForPicker}
          title={stepIndex === 1 ? "Follow-up 1 Schedule" : "Follow-up 2 Schedule"}
          subtitle={
            stepIndex === 1
              ? "Choose when Follow-up 1 should be dispatched relative to initial email"
              : "Choose when Follow-up 2 should be dispatched (calculated relative to Follow-up 1)"
          }
          onApply={handleApplyCustom}
          onCancel={() => setIsPickerOpen(false)}
        />
      )}
    </div>
  );
}
