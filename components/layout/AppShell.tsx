"use client";

import React, { useState } from "react";
import { AppModule } from "../../types";
import LeadLensLogo from "../common/LeadLensLogo";
import {
  LayoutGrid,
  Rocket,
  Users,
  Inbox,
  CalendarCheck,
  TrendingUp,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  House,
} from "lucide-react";

interface AppShellProps {
  currentModule: AppModule;
  onSelectModule: (module: AppModule) => void;
  onOpenPrompt: () => void;
  onSwitchToLanding: () => void;
  hideSidebar?: boolean;
  workspaceStatus?: string;
  children: React.ReactNode;
}

const menuItems: { id: AppModule; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "campaign", label: "Campaigns", icon: Rocket },
  { id: "leads", label: "Leads", icon: Users },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "meetings", label: "Meetings", icon: CalendarCheck },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
];

function isItemActive(currentModule: AppModule, itemId: AppModule) {
  if (itemId === "campaign") {
    return currentModule === "campaign" || currentModule === "campaigns";
  }
  if (itemId === "leads") {
    return currentModule === "leads" || currentModule === "email-sequence";
  }
  return currentModule === itemId;
}

function moduleTitle(currentModule: AppModule) {
  if (currentModule === "email-sequence") return "Email sequence";
  if (currentModule === "campaign" || currentModule === "campaigns") return "Campaigns";
  if (currentModule === "lead-generation") return "Lead generation";
  return currentModule.replace("-", " ");
}

export default function AppShell({
  currentModule,
  onSelectModule,
  onOpenPrompt,
  onSwitchToLanding,
  hideSidebar = false,
  workspaceStatus,
  children,
}: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const selectModule = (module: AppModule) => {
    onSelectModule(module);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-white text-ink">
      {!hideSidebar && (
        <aside
          className={`${
            isCollapsed ? "w-[72px]" : "w-64"
          } sticky top-0 hidden h-screen shrink-0 flex-col justify-between border-r border-line bg-white p-3 md:flex`}
        >
          <div className="space-y-5">
            <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} gap-2 pt-1`}>
              {!isCollapsed && <LeadLensLogo variant="nav" />}
              {isCollapsed && <LeadLensLogo variant="sm" />}
              <button
                type="button"
                onClick={() => setIsCollapsed((value) => !value)}
                className="icon-btn"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-green" />
                ) : (
                  <ChevronLeft className="h-4 w-4 text-green" />
                )}
              </button>
            </div>

            {!isCollapsed && workspaceStatus && (
              <div className="rounded-2xl border border-sage bg-green-soft p-3">
                <span className="block text-xs font-medium text-muted">Workspace</span>
                <span className="mt-0.5 block text-sm font-bold text-ink">{workspaceStatus}</span>
              </div>
            )}

            <nav className="space-y-1" aria-label="Workspace">
              {!isCollapsed && (
                <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Workspace
                </div>
              )}
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(currentModule, item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectModule(item.id)}
                    className={`flex w-full items-center rounded-2xl py-2.5 text-sm font-semibold transition-colors ${
                      isCollapsed ? "justify-center px-0" : "gap-3 px-3"
                    } ${active ? "bg-green text-white" : "text-ink hover:bg-mist"}`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-ink"}`} />
                    {!isCollapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-line pt-3">
            <button
              type="button"
              onClick={onSwitchToLanding}
              className={`flex w-full items-center rounded-xl py-2 text-xs font-semibold text-muted hover:bg-mist hover:text-green ${
                isCollapsed ? "justify-center" : "px-3"
              }`}
            >
              {!isCollapsed && <span>Back to landing</span>}
              {isCollapsed && <House className="h-4 w-4" />}
            </button>
          </div>
        </aside>
      )}

      {isMobileMenuOpen && !hideSidebar && (
        <div className="fixed inset-0 z-40 bg-ink/30 md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="h-full w-[280px] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <LeadLensLogo variant="nav" />
              <button className="icon-btn" type="button" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(currentModule, item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectModule(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${
                      active ? "bg-green text-white" : "text-ink hover:bg-mist"
                    }`}
                  >
                    <Icon className="h-5 w-5" /> {item.label}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {hideSidebar && <LeadLensLogo variant="nav" />}
            <h2 className="truncate font-serif text-lg font-bold capitalize text-ink sm:text-xl">
              {moduleTitle(currentModule)}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!hideSidebar && (
              <button className="icon-btn md:hidden" type="button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenPrompt}
              className="rounded-full bg-green px-4 py-2 text-xs font-semibold text-white hover:bg-green-dark"
            >
              New Campaign
            </button>
          </div>
        </header>

        {!hideSidebar && (
          <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 p-2 backdrop-blur md:hidden" aria-label="Mobile navigation">
            {[
              { id: "dashboard" as AppModule, label: "Home", icon: House },
              { id: "campaign" as AppModule, label: "Campaign", icon: Rocket },
              { id: "leads" as AppModule, label: "Leads", icon: Users },
              { id: "inbox" as AppModule, label: "Inbox", icon: Inbox },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectModule(id)}
                className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-semibold ${
                  isItemActive(currentModule, id) ? "text-green" : "text-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setIsMobileMenuOpen(true)} className="flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-semibold text-muted">
              <Menu className="h-4 w-4" />
              Menu
            </button>
          </nav>
        )}

        <main className={`min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 lg:p-8 ${hideSidebar ? "pb-8" : "pb-24 md:pb-8"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
