"use client";

import { useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, UserCheck } from "lucide-react";
import { generatedLeadPool, leadDomain } from "../../lib/leads";
import type { Lead } from "../../types";
import LeadLensLogo from "../common/LeadLensLogo";

export interface LeadGenerationContext {
  prompt: string;
  selectedLeadIds: string[];
  selectedLeads: Lead[];
  allLeads: Lead[];
  connectedEmail: string;
  provider: string;
  companyDomain?: string;
}

interface LeadGenerationModuleProps {
  prompt: string;
  onConnectionComplete: (context: LeadGenerationContext) => void;
  onBackToLanding?: () => void;
}

export default function LeadGenerationModule({
  prompt,
  onConnectionComplete,
  onBackToLanding,
}: LeadGenerationModuleProps) {
  const { data: session, status } = useSession();
  const [revealedAll, setRevealedAll] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState("");

  // Exactly 8 leads loaded in dataset
  const allGeneratedLeads = useMemo(() => generatedLeadPool.slice(0, 8), []);

  // Visible leads: initially only 3, reveals all 8 after clicking Show More Leads
  const visibleLeads = useMemo(
    () => (revealedAll ? allGeneratedLeads : allGeneratedLeads.slice(0, 3)),
    [revealedAll, allGeneratedLeads],
  );

  // Selected leads: initialized to first 3 leads
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(allGeneratedLeads.slice(0, 3).map((lead) => lead.id)),
  );

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShowMoreLeads = () => {
    // Reveal all 8 leads on the same screen
    setRevealedAll(true);
    setSelected((current) => {
      const next = new Set(current);
      allGeneratedLeads.forEach((lead) => next.add(lead.id));
      return next;
    });
  };

  const handleProceedAuthenticated = () => {
    const selectedLeads = allGeneratedLeads.filter((lead) => selected.has(lead.id));
    if (!selectedLeads.length) {
      setError("Please select at least one lead.");
      return;
    }

    onConnectionComplete({
      prompt,
      selectedLeadIds: selectedLeads.map((lead) => lead.id),
      selectedLeads,
      allLeads: allGeneratedLeads,
      connectedEmail: session?.user?.email || "",
      provider: "Google Workspace / Gmail",
    });
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setError("");

      const selectedLeads = allGeneratedLeads.filter((lead) => selected.has(lead.id));

      // Persist exact prompt and all 8 leads across Google OAuth
      const pendingContext = {
        prompt,
        selectedLeadIds: selectedLeads.map((lead) => lead.id),
        selectedLeads,
        allLeads: allGeneratedLeads,
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem("leadlens-pending-onboarding", JSON.stringify(pendingContext));
      }

      await signIn("google", {
        callbackUrl: "/dashboard?continue=onboarding",
      });
    } catch (err) {
      setIsSigningIn(false);
      setError(err instanceof Error ? err.message : "Unable to initialize Google sign-in. Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 sm:px-6 sm:py-8 flex flex-col justify-center">
      <div className="mx-auto w-full max-w-4xl">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <LeadLensLogo variant="sm" />
            <div>
              <h1 className="font-serif text-xl sm:text-2xl font-bold text-ink">
                Matching Leads
              </h1>
              <p className="text-xs text-muted">
                {revealedAll ? "All 8 verified leads unlocked" : "Showing 3 of 8 matching leads"}
              </p>
            </div>
          </div>
          {onBackToLanding && (
            <button
              type="button"
              onClick={onBackToLanding}
              className="btn btn-secondary text-xs cursor-pointer py-1.5 px-3"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Compact Lead Cards Container */}
        <div className="space-y-2.5">
          {visibleLeads.map((lead, index) => {
            const isChecked = selected.has(lead.id);
            return (
              <div
                key={lead.id}
                onClick={() => toggle(lead.id)}
                className={`flex items-center justify-between gap-3 rounded-2xl border p-3 sm:px-4 sm:py-3 transition-all cursor-pointer ${
                  isChecked
                    ? "border-green/40 bg-white shadow-xs"
                    : "border-line bg-white/70 hover:bg-white"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(lead.id)}
                    aria-label={`Select ${lead.name}`}
                    className="h-4 w-4 shrink-0 rounded accent-green cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-ink truncate">{lead.name}</span>
                      <span className="text-[11px] text-muted truncate">· {lead.jobTitle}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted truncate mt-0.5">
                      <span className="font-medium text-ink truncate">{lead.company}</span>
                      <span>·</span>
                      <span className="truncate">{lead.location}</span>
                      <span>·</span>
                      <span className="truncate">{leadDomain(lead)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="hidden sm:inline-flex rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold text-green">
                    {lead.verificationTag}
                  </span>
                  <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-bold text-ink">
                    {lead.matchScore}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted">
            {selected.size} of {visibleLeads.length} leads selected
          </p>

          <div className="flex items-center gap-2">
            {!revealedAll ? (
              <button
                type="button"
                onClick={handleShowMoreLeads}
                className="btn btn-primary text-xs sm:text-sm py-2 px-4 cursor-pointer flex items-center gap-2 shadow-xs"
              >
                <span>Show More Leads</span>
                <ArrowRight className="h-4 w-4 text-gold" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRevealedAll(false)}
                  className="btn btn-secondary text-xs sm:text-sm py-2 px-3 cursor-pointer"
                >
                  Show Less
                </button>
                {status === "authenticated" ? (
                  <button
                    type="button"
                    onClick={handleProceedAuthenticated}
                    className="btn btn-primary text-xs sm:text-sm py-2 px-4 cursor-pointer flex items-center gap-2 shadow-xs"
                  >
                    <span>Continue to Campaign Setup</span>
                    <ArrowRight className="h-4 w-4 text-gold" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAuthModal(true)}
                    className="btn btn-primary text-xs sm:text-sm py-2 px-4 cursor-pointer flex items-center gap-2 shadow-xs"
                  >
                    <span>Sign in to Continue</span>
                    <ArrowRight className="h-4 w-4 text-gold" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Google Authentication Modal (Shown when continuing) */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4"
          onClick={() => setShowAuthModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-line bg-white p-7 sm:p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <LeadLensLogo variant="nav" />
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="text-xs font-semibold text-muted hover:text-ink cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="mt-6">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-3 py-1 text-xs font-bold text-green">
                <Sparkles className="h-3.5 w-3.5" />
                <span>All 8 leads revealed</span>
              </div>
              <h2 className="mt-3 font-serif text-2xl font-bold tracking-tight text-ink">
                Sign in to continue
              </h2>
              <p className="mt-1.5 text-xs text-muted leading-relaxed">
                Connect your Google account to save your campaign, unlock the full outreach sequence, and enter your workspace.
              </p>
            </div>

            {error && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[#D8E2E1] bg-white px-5 py-3.5 text-sm font-semibold text-ink shadow-xs transition-all hover:border-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {isSigningIn ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-green" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="w-full rounded-2xl py-2 text-center text-xs font-semibold text-muted hover:text-ink cursor-pointer"
              >
                Review leads
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
