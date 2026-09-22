"use client";

import React from 'react';
import LeadLensLogo from '../common/LeadLensLogo';
import { 
  ArrowRight, 
  ShieldCheck, 
  Users, 
  Inbox,
} from 'lucide-react';

interface LandingPageProps {
  onStartCampaign: () => void;
  onEnterApp: () => void;
}

export default function LandingPage({ onStartCampaign, onEnterApp }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white text-[#1B2632] flex flex-col justify-between selection:bg-[#045C5C]/20">
      
      {/* Top Navbar */}
      <header className="px-6 sm:px-12 py-4 flex items-center justify-between border-b border-[#E3E8E7]/60 bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <LeadLensLogo variant="nav" />
        </div>

        <nav className="hidden md:flex items-center gap-10 text-sm font-medium text-[#5A6672]">
          <a href="#how-it-works" className="hover:text-[#045C5C] transition-colors">
            How it works
          </a>
          <a href="#features" className="hover:text-[#045C5C] transition-colors">
            Features
          </a>
          <a href="#benefits" className="hover:text-[#045C5C] transition-colors">
            Benefits
          </a>
          <button onClick={onEnterApp} className="hover:text-[#045C5C] transition-colors cursor-pointer">
            Workspace
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={onStartCampaign}
            className="px-6 py-2.5 rounded-full bg-[#045C5C] hover:bg-[#034A4A] text-white font-semibold text-sm transition-all shadow-xs cursor-pointer flex items-center gap-2"
          >
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4 text-[#BC9747]" />
          </button>
        </div>
      </header>

      <section className="max-w-7xl mx-auto w-full px-6 sm:px-12 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        
        {/* Left Side: Headline & Copy */}
        <div className="lg:col-span-6 space-y-6">
          <div className="text-xs font-bold tracking-widest text-[#045C5C] uppercase">
            THE OUTBOUND INTELLIGENCE WORKSPACE
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1B2632] tracking-tight leading-[1.15]">
            See the right path to pipeline.
          </h1>

          <p className="text-[#5A6672] text-base sm:text-lg leading-relaxed max-w-xl">
            LeadLens turns one clear campaign brief into an intentional outbound workflow: review the right people, connect a sending inbox, and launch only when every safeguard is ready.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <button
              onClick={onStartCampaign}
              className="px-7 py-3.5 rounded-xl bg-[#045C5C] hover:bg-[#034A4A] text-white font-bold text-sm shadow-sm transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4 text-[#BC9747]" />
            </button>
            <button
              onClick={onEnterApp}
              className="px-7 py-3.5 rounded-xl bg-white border border-[#D8E2E1] hover:border-[#1B2632] text-[#1B2632] font-semibold text-sm transition-colors cursor-pointer"
            >
              Explore the workflow
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#E3E8E7] shadow-xl overflow-hidden">
            
            {/* Header Bar */}
            <div className="px-5 py-3 bg-[#0F352E] text-white flex items-center justify-between">
              <span className="font-medium text-xs sm:text-sm">LeadLens campaign command</span>
              <span className="text-xs font-medium text-[#2F9E5B] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2F9E5B] animate-pulse"></span>
                ready
              </span>
            </div>

            {/* Card Content */}
            <div className="p-6 space-y-5">
              <div>
                <span className="text-xs text-[#5A6672] font-medium">Campaign workflow</span>
                <h3 className="text-xl sm:text-2xl font-bold text-[#1B2632] tracking-tight mt-1">
                  Brief → Leads → Inbox → Launch
                </h3>
              </div>

              {/* Two Status Boxes */}
              <div className="grid grid-cols-2 gap-3.5">
                {/* Box 1: Matching leads */}
                <div className="p-4 rounded-2xl bg-[#EAF5EF]">
                  <span className="text-xs text-[#5A6672] font-medium">Matching leads</span>
                  <div className="text-base sm:text-lg font-extrabold text-[#1B2632] mt-0.5">
                    1,200 found
                  </div>
                  <div className="w-full h-1.5 bg-[#D2EADA] rounded-full mt-2.5 overflow-hidden">
                    <div className="w-4/5 h-full bg-[#045C5C] rounded-full"></div>
                  </div>
                </div>

                {/* Box 2: Inbox health */}
                <div className="p-4 rounded-2xl bg-[#FDF6E9]">
                  <span className="text-xs text-[#5A6672] font-medium">Inbox health</span>
                  <div className="text-base sm:text-lg font-extrabold text-[#1B2632] mt-0.5">
                    Warmup ready
                  </div>
                  <div className="w-full h-1.5 bg-[#F6E6C9] rounded-full mt-2.5 overflow-hidden">
                    <div className="w-3/4 h-full bg-[#BC9747] rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* A guided setup Box */}
              <div className="p-4 rounded-2xl border border-[#E3E8E7] bg-[#F7F9F9]/50">
                <span className="text-xs text-[#5A6672] font-medium">A guided setup</span>
                <p className="text-xs sm:text-sm font-semibold text-[#1B2632] mt-1">
                  Choose the right people before a single email is sent.
                </p>
              </div>
            </div>

          </div>
        </div>

      </section>

      {/* Section 1: How It Works (Simple 3-Step Guided Workflow) */}
      <section id="how-it-works" className="py-16 bg-[#F7F9F9] border-y border-[#E3E8E7]">
        <div className="max-w-7xl mx-auto px-6 sm:px-12">
          
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-[#045C5C] bg-[#EAF5EF] px-3 py-1 rounded-full">
              Intuitive Journey
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1B2632] mt-3">
              How LeadLens Works
            </h2>
            <p className="text-xs sm:text-sm text-[#5A6672] mt-2">
              From a single sales description to live deliverability-guarded outreach in 3 steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Step 1 */}
            <div className="p-6 rounded-3xl bg-white border border-[#E3E8E7] shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-2xl bg-[#EAF5EF] text-[#045C5C] font-bold text-sm flex items-center justify-center mb-4">
                  1
                </div>
                <h3 className="text-base font-bold text-[#1B2632]">
                  Describe Your Offer
                </h3>
                <p className="text-xs text-[#5A6672] mt-2 leading-relaxed">
                  Enter who you help and what you sell in simple natural language. LeadLens extracts your ideal customer profile automatically.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E3E8E7] text-[11px] font-semibold text-[#045C5C]">
                No complex boolean queries
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-3xl bg-white border border-[#E3E8E7] shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-2xl bg-[#EAF5EF] text-[#045C5C] font-bold text-sm flex items-center justify-center mb-4">
                  2
                </div>
                <h3 className="text-base font-bold text-[#1B2632]">
                  Preview & Select Leads
                </h3>
                <p className="text-xs text-[#5A6672] mt-2 leading-relaxed">
                  See an initial preview of verified matching leads with waterfall contact enrichment. Click “Show More Leads” to review the entire target list.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E3E8E7] text-[11px] font-semibold text-[#045C5C]">
                100% verified direct emails
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-3xl bg-white border border-[#E3E8E7] shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-2xl bg-[#EAF5EF] text-[#045C5C] font-bold text-sm flex items-center justify-center mb-4">
                  3
                </div>
                <h3 className="text-base font-bold text-[#1B2632]">
                  Connect & Safeguard
                </h3>
                <p className="text-xs text-[#5A6672] mt-2 leading-relaxed">
                  Connect your Google or Microsoft sending inbox. Our automated warmup and rate-limiting shield keeps you out of spam folders.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-[#E3E8E7] text-[11px] font-semibold text-[#045C5C]">
                99%+ inbox placement guaranteed
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* Section 2: Key Benefits & Features */}
      <section id="benefits" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-6 sm:px-12">
          
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-[#BC9747] bg-[#FDF6E9] px-3 py-1 rounded-full">
              Why LeadLens
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#1B2632] mt-3">
              Built for Intentional Outbound
            </h2>
            <p className="text-xs sm:text-sm text-[#5A6672] mt-2">
              Everything you need to source qualified prospects and book meetings without deliverability drift.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="p-6 rounded-3xl bg-[#F7F9F9] border border-[#E3E8E7]">
              <div className="w-10 h-10 rounded-2xl bg-white text-[#045C5C] flex items-center justify-center mb-4 shadow-2xs">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-[#1B2632]">
                Progressive Lead Sourcing
              </h3>
              <p className="text-xs text-[#5A6672] mt-2 leading-relaxed">
                Filter and select verified contacts before spending sending credits. Search by location, company size, and executive seniority.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-[#F7F9F9] border border-[#E3E8E7]">
              <div className="w-10 h-10 rounded-2xl bg-white text-[#045C5C] flex items-center justify-center mb-4 shadow-2xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-[#1B2632]">
                Automated Warmup & Reputation
              </h3>
              <p className="text-xs text-[#5A6672] mt-2 leading-relaxed">
                Domain warmup shields, SPF/DKIM verification, and daily limit enforcement prevent your cold emails from ever hitting spam.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-[#F7F9F9] border border-[#E3E8E7]">
              <div className="w-10 h-10 rounded-2xl bg-white text-[#045C5C] flex items-center justify-center mb-4 shadow-2xs">
                <Inbox className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-[#1B2632]">
                Unified Inbox & AI Triage
              </h3>
              <p className="text-xs text-[#5A6672] mt-2 leading-relaxed">
                Automatically sorts prospect replies into Interested, Needs Info, and Not Interested, with 1-click meeting calendar links.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* Clean Call To Action Section */}
      <section className="py-16 bg-[#0F352E] text-white">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-5">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold">
            Ready to find your best-fit pipeline?
          </h2>
          <p className="text-xs sm:text-sm text-[#D2EADA] max-w-lg mx-auto leading-relaxed">
            Start with one campaign description. Experience our progressive lead generation and launch outreach you can trust.
          </p>
          <div className="pt-2">
            <button
              onClick={onStartCampaign}
              className="px-8 py-3.5 rounded-full bg-[#045C5C] hover:bg-[#034A4A] text-white font-bold text-sm shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <span>Start Campaign</span>
              <ArrowRight className="w-4 h-4 text-[#BC9747]" />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[#E3E8E7] py-8">
        <div className="max-w-7xl mx-auto px-6 sm:px-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LeadLensLogo variant="sm" />
          </div>
          <p className="text-xs text-[#5A6672]">
            © 2026 LeadLens AI. The outbound intelligence workspace.
          </p>
        </div>
      </footer>

    </div>
  );
}
