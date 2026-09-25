"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
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
  LogOut,
  User,
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
  if (currentModule === "settings") return "Profile & Settings";
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
  const { data: session } = useSession();
  // Sidebar is closed/collapsed by default
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const selectModule = (module: AppModule) => {
    onSelectModule(module);
    setIsMobileMenuOpen(false);
  };

  const handleToggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setIsCollapsed((prev) => !prev);
    } else {
      setIsMobileMenuOpen((prev) => !prev);
    }
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  const userName = session?.user?.name || session?.user?.email || "Workspace User";
  const userEmail = session?.user?.email || "";
  const userImage = session?.user?.image;
  const initial = (userName[0] || "U").toUpperCase();

  return (
    <div className="flex min-h-screen bg-white text-ink">
      {!hideSidebar && (
        <aside
          className={`${
            isCollapsed ? "w-[72px]" : "w-64"
          } sticky top-0 hidden h-screen shrink-0 flex-col justify-between border-r border-line bg-white p-3 md:flex transition-all duration-200`}
        >
          <div className="space-y-5">
            <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} gap-2 pt-1`}>
              {!isCollapsed && <LeadLensLogo variant="nav" />}
              {isCollapsed && <LeadLensLogo variant="sm" />}
              <button
                type="button"
                onClick={() => setIsCollapsed((value) => !value)}
                className="icon-btn cursor-pointer"
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
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(currentModule, item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectModule(item.id)}
                    className={`flex w-full items-center rounded-2xl py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
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

          <div className="space-y-1.5 border-t border-line pt-3">
            {/* Clickable Profile Section -> Opens Profile / Settings */}
            <button
              type="button"
              onClick={() => selectModule("settings")}
              className={`flex w-full items-center ${isCollapsed ? "justify-center" : "gap-2.5 px-2"} py-2 rounded-2xl hover:bg-mist transition-colors cursor-pointer text-left`}
              title="View profile details"
            >
              {userImage ? (
                <Image
                  src={userImage}
                  alt={userName}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-line object-cover shrink-0"
                  unoptimized
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-soft text-xs font-bold text-green">
                  {initial}
                </div>
              )}
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-ink hover:text-green transition-colors">{userName}</p>
                  {userEmail && <p className="truncate text-[10px] text-muted">{userEmail}</p>}
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={onSwitchToLanding}
              className={`flex w-full items-center rounded-xl py-2 text-xs font-semibold text-muted hover:bg-mist hover:text-green cursor-pointer ${
                isCollapsed ? "justify-center" : "px-3"
              }`}
              title="Back to landing"
            >
              {!isCollapsed && <span>Back to landing</span>}
              {isCollapsed && <House className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className={`flex w-full items-center rounded-xl py-2 text-xs font-semibold text-muted hover:bg-red-50 hover:text-red-600 cursor-pointer ${
                isCollapsed ? "justify-center" : "gap-2 px-3"
              }`}
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              {!isCollapsed && <span>Sign out</span>}
            </button>
          </div>
        </aside>
      )}

      {isMobileMenuOpen && !hideSidebar && (
        <div className="fixed inset-0 z-40 bg-ink/30 md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <aside className="h-full w-[280px] flex flex-col justify-between bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div>
              <div className="flex items-center justify-between">
                <LeadLensLogo variant="nav" />
                <button className="icon-btn cursor-pointer" type="button" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu">
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
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold cursor-pointer ${
                        active ? "bg-green text-white" : "text-ink hover:bg-mist"
                      }`}
                    >
                      <Icon className="h-5 w-5" /> {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-line pt-4 space-y-2">
              {/* Clickable Profile in Mobile Drawer */}
              <button
                type="button"
                onClick={() => selectModule("settings")}
                className="flex w-full items-center gap-2.5 rounded-2xl p-2 hover:bg-mist transition-colors cursor-pointer text-left"
                title="View profile details"
              >
                {userImage ? (
                  <Image
                    src={userImage}
                    alt={userName}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full border border-line object-cover shrink-0"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-soft text-xs font-bold text-green">
                    {initial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-ink">{userName}</p>
                  {userEmail && <p className="truncate text-[10px] text-muted">{userEmail}</p>}
                </div>
              </button>

              <button
                type="button"
                onClick={onSwitchToLanding}
                className="flex w-full items-center gap-2 rounded-xl py-2 px-1 text-xs font-semibold text-muted hover:text-green cursor-pointer"
              >
                <House className="h-4 w-4" />
                <span>Back to landing</span>
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-xl py-2 px-1 text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {!hideSidebar && (
              <button
                className="icon-btn cursor-pointer"
                type="button"
                onClick={handleToggleSidebar}
                title={isCollapsed ? "Open sidebar" : "Close sidebar"}
                aria-label="Toggle sidebar menu"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
            {hideSidebar && <LeadLensLogo variant="nav" />}
            <h2 className="truncate font-serif text-lg font-bold capitalize text-ink sm:text-xl">
              {moduleTitle(currentModule)}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenPrompt}
              className="rounded-full bg-green px-4 py-2 text-xs font-semibold text-white hover:bg-green-dark cursor-pointer"
            >
              New Campaign
            </button>
          </div>
        </header>

        {!hideSidebar && (
          <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden" aria-label="Mobile navigation">
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
                className={`flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-semibold cursor-pointer ${
                  isItemActive(currentModule, id) ? "text-green" : "text-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-semibold text-muted cursor-pointer"
            >
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
