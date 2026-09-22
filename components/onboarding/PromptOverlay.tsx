"use client";

import { useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import LeadLensLogo from "../common/LeadLensLogo";

interface PromptOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptSubmitted: (prompt: string) => void;
}

export default function PromptOverlay({
  isOpen,
  onClose,
  onPromptSubmitted,
}: PromptOverlayProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [promptText, setPromptText] = useState(
    "We help boutique recruitment firms book more qualified client conversations with enterprise tech leaders...",
  );

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = promptText.trim();
    if (!prompt) return;

    setIsGenerating(true);
    window.setTimeout(() => {
      onPromptSubmitted(prompt);
      setIsGenerating(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2632]/50 p-3 backdrop-blur-xs sm:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#E3E8E7] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#E3E8E7] bg-[#F7F9F9] px-6 py-4">
          <div className="flex items-center gap-3">
            <LeadLensLogo variant="sm" />
            <div className="hidden h-4 w-px bg-[#E3E8E7] sm:block" />
            <span className="text-xs font-semibold text-[#045C5C]">Campaign brief</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#5A6672] transition-colors hover:bg-[#E3E8E7] hover:text-[#1B2632]"
            aria-label="Close campaign prompt"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 sm:p-10">
          {isGenerating ? (
            <div className="space-y-4 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF5EF] text-[#045C5C]">
                <Sparkles className="h-7 w-7 animate-spin text-[#BC9747]" />
              </div>
              <h2 className="font-serif text-2xl font-bold text-[#1B2632]">
                Analyzing your campaign brief...
              </h2>
              <p className="mx-auto max-w-sm text-sm text-[#5A6672]">
                We are preparing your initial three-lead preview.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-widest text-[#045C5C]">
                Campaign prompt
              </p>
              <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#1B2632] sm:text-4xl">
                What are you selling?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#5A6672] sm:text-base">
                Describe your offer, target audience, and desired outcome. LeadLens will use it to generate your initial lead preview.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <label className="block text-sm font-bold text-[#1B2632]">
                  Describe your campaign
                  <textarea
                    rows={6}
                    value={promptText}
                    onChange={(event) => setPromptText(event.target.value)}
                    placeholder="We help boutique recruitment firms book more qualified client conversations..."
                    className="mt-2 w-full resize-none rounded-2xl border border-[#D8E2E1] p-4 text-sm leading-relaxed text-[#1B2632] shadow-2xs focus:border-[#045C5C] focus:outline-none focus:ring-1 focus:ring-[#045C5C] sm:text-base"
                    required
                  />
                </label>
                <div className="flex flex-col justify-between gap-4 pt-2 sm:flex-row sm:items-center">
                  <span className="text-xs text-[#5A6672]">
                    Your brief carries forward into the lead and campaign workflow.
                  </span>
                  <button
                    type="submit"
                    className="flex items-center justify-center gap-2 self-end whitespace-nowrap rounded-full bg-[#045C5C] px-7 py-3 font-semibold text-sm text-white transition-colors hover:bg-[#034A4A] sm:self-auto"
                  >
                    Generate Matching Leads
                    <ArrowRight className="h-4 w-4 text-[#BC9747]" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
