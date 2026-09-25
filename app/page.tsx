"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";
import PromptOverlay from "@/components/onboarding/PromptOverlay";
import LeadGenerationModule, { LeadGenerationContext } from "@/components/modules/LeadGenerationModule";

export default function Page() {
  const router = useRouter();
  const [viewState, setViewState] = useState<"landing" | "leads">("landing");
  const [isPromptOverlayOpen, setIsPromptOverlayOpen] = useState(false);
  const [campaignPrompt, setCampaignPrompt] = useState("");

  const handleStartCampaign = () => {
    setIsPromptOverlayOpen(true);
  };

  const handlePromptSubmitted = (prompt: string) => {
    setCampaignPrompt(prompt);
    setIsPromptOverlayOpen(false);
    setViewState("leads");
  };

  // Called when an already authenticated user continues from the lead preview
  const handleConnectionComplete = async (context: LeadGenerationContext) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("leadlens-pending-onboarding", JSON.stringify(context));
      }
      router.push("/dashboard?continue=onboarding");
    } catch (error) {
      console.error("[Page] Error continuing to workspace:", error);
    }
  };

  if (viewState === "leads") {
    return (
      <div className="min-h-screen bg-canvas">
        <LeadGenerationModule
          prompt={campaignPrompt}
          onConnectionComplete={handleConnectionComplete}
          onBackToLanding={() => setViewState("landing")}
        />
      </div>
    );
  }

  return (
    <>
      <LandingPage
        onStartCampaign={handleStartCampaign}
        onEnterApp={() => router.push("/dashboard")}
      />

      <PromptOverlay
        key={isPromptOverlayOpen ? "prompt-open" : "prompt-closed"}
        isOpen={isPromptOverlayOpen}
        onClose={() => setIsPromptOverlayOpen(false)}
        onPromptSubmitted={handlePromptSubmitted}
      />
    </>
  );
}
