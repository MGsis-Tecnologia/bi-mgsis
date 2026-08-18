"use client";

import * as React from "react";
import { Bell, LogOut } from "lucide-react";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { CurrencySwitcher } from "@/components/filters/currency-switcher";
import { EmpresaSwitcher } from "@/components/filters/empresa-switcher";
import { LanguageSwitcher } from "@/components/filters/language-switcher";
import { GlobalFilters } from "@/components/filters/global-filters";
import { ThemeToggle } from "./theme-toggle";
import { BrandMark } from "./brand-mark";
import { ClientMounted } from "@/components/providers/client-mounted";
import { useTranslation } from "@/lib/hooks/use-translation";

interface TopbarProps {
  user?: { name: string; initials: string };
  empresaNome?: string;
}

export function Topbar({ user, empresaNome }: TopbarProps) {
  const { t } = useTranslation();
  const [showLogoutMenu, setShowLogoutMenu] = React.useState(false);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 glass border-b border-border">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <div className="lg:hidden">
          <BrandMark showWord={false} />
        </div>

        {empresaNome && (
          <span className="hidden md:block truncate text-sm font-medium text-foreground">
            {empresaNome}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ClientMounted fallback={<div className="h-8 w-64 animate-pulse bg-muted/40 rounded-md" />}>
            <DateRangePicker />
            <GlobalFilters />
            <EmpresaSwitcher />
            <CurrencySwitcher />
            <LanguageSwitcher />
            <div className="hidden md:block h-5 w-px bg-border mx-1" />
            <button className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40">
              <Bell className="h-[15px] w-[15px]" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
            </button>
            <ThemeToggle />
            <div className="relative">
              <button
                onClick={() => setShowLogoutMenu(!showLogoutMenu)}
                className="ml-1 flex items-center gap-2.5 rounded-md border border-border bg-surface px-1.5 py-1 pl-1 hover:bg-muted/40 transition-colors"
              >
                <div className="grid h-6 w-6 place-items-center rounded-[5px] bg-foreground text-background text-[10px] font-medium">
                  {user?.initials ?? "??"}
                </div>
                <span className="hidden md:inline text-xs font-medium pr-2">{user?.name ?? ""}</span>
              </button>

              {/* Logout Menu */}
              {showLogoutMenu && (
                <div className="absolute right-0 mt-1 w-40 rounded-md border border-border bg-background shadow-lg z-50">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted/60 rounded-md transition-colors first:rounded-t-md last:rounded-b-md"
                  >
                    <LogOut className="h-4 w-4 text-muted-foreground" />
                    <span>{t("topbar.logout")}</span>
                  </button>
                </div>
              )}
            </div>
          </ClientMounted>
        </div>
      </div>
    </header>
  );
}
