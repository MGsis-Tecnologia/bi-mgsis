"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  Package,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  UserSquare2,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";
import { DictionaryKey } from "@/lib/i18n/dictionaries";
import { useDataset } from "@/lib/hooks/use-dataset";
import { useFilters } from "@/lib/store/filters";
import { generateInsights, type Insight } from "@/lib/analytics/insights";

type NavItem = {
  href: string;
  labelKey: DictionaryKey;
  icon: React.ElementType;
};

type NavGroup = {
  sectionKey: DictionaryKey;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    sectionKey: "sidebar.section.vision",
    items: [
      { href: "/dashboard", labelKey: "sidebar.nav.executive", icon: Activity },
      { href: "/vendas", labelKey: "sidebar.nav.sales_analysis", icon: BarChart3 },
      { href: "/comparativo", labelKey: "sidebar.nav.annual", icon: CalendarRange },
    ],
  },
  {
    sectionKey: "sidebar.section.catalog",
    items: [
      { href: "/produtos", labelKey: "sidebar.nav.products", icon: Package },
      { href: "/clientes", labelKey: "sidebar.nav.customers", icon: Users },
      { href: "/vendedores", labelKey: "sidebar.nav.sellers", icon: UserSquare2 },
    ],
  },
  {
    sectionKey: "sidebar.section.financial",
    items: [
      { href: "/financeiro", labelKey: "sidebar.nav.revenue", icon: Banknote },
      { href: "/financeiro/receber", labelKey: "sidebar.nav.receivable", icon: CircleDollarSign },
      { href: "/financeiro/pagar", labelKey: "sidebar.nav.payable", icon: Wallet },
    ],
  },
  {
    sectionKey: "sidebar.section.operation",
    items: [
      { href: "/importacao", labelKey: "sidebar.nav.import", icon: Upload },
    ],
  },
];

const INSIGHT_TONE_STYLES: Record<Insight["tone"], { icon: React.ElementType; iconClass: string }> = {
  positive: { icon: TrendingUp, iconClass: "text-emerald-500" },
  negative: { icon: TrendingDown, iconClass: "text-rose-500" },
  warning: { icon: AlertTriangle, iconClass: "text-amber-500" },
  neutral: { icon: Sparkles, iconClass: "text-muted-foreground" },
};

const INSIGHT_HREF: Record<string, string> = {
  "top-subgroup": "/produtos",
  "margin-alert": "/vendas",
  "revenue-trend": "/vendas",
  "ticket-trend": "/vendas",
  "momentum": "/vendas",
};

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const ds = useDataset();
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const getRange = useFilters((s) => s.getRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);
  const dailyInsight = React.useMemo<Insight | null>(() => {
    if (!ds.hasData) return null;
    const list = generateInsights(ds.orders, range);
    return list[0] ?? null;
  }, [ds.hasData, ds.orders, range]);

  const insightStyle = dailyInsight ? INSIGHT_TONE_STYLES[dailyInsight.tone] : INSIGHT_TONE_STYLES.neutral;
  const InsightIcon = insightStyle.icon;
  const investigateHref = dailyInsight ? (INSIGHT_HREF[dailyInsight.id] ?? "/vendas") : "/vendas";
  const emptyMessage = !ds.hasData
    ? t("sidebar.insight.empty.noData")
    : t("sidebar.insight.empty.noHighlights");

  return (
    <aside className="hidden lg:flex h-screen sticky top-0 w-[244px] shrink-0 flex-col border-r border-border bg-surface/40">
      <div className="flex flex-col items-center justify-center px-4 pt-5 pb-4 border-b border-border gap-2">
        <Link href="/dashboard" aria-label="MGSIS Analytics" className="group flex flex-col items-center gap-2.5">
          <Image
            src="/logo-mgsis.png"
            alt="MGSIS Tecnologia"
            width={152}
            height={91}
            className="object-contain"
            priority
          />
          <span className="font-serif text-[18px] leading-none tracking-wide text-foreground">
            MGSIS Analytics
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV.map((group) => (
          <div key={group.sectionKey} className="px-3 pb-4">
            <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t(group.sectionKey)}
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === item.href
                    : pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-muted/70 text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 -translate-y-1/2 w-px bg-foreground" />
                      )}
                      <Icon className="h-[15px] w-[15px] shrink-0" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-md border border-border bg-surface-sunken p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <InsightIcon className={cn("h-3 w-3", dailyInsight && insightStyle.iconClass)} />
          {t("sidebar.insight.title")}
        </div>
        {dailyInsight ? (
          <>
            <p className="mt-2 text-xs leading-relaxed text-foreground/80">
              {dailyInsight.title}
            </p>
            <Link
              href={investigateHref}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              {t("sidebar.insight.investigate")} <ArrowUpRight className="h-3 w-3" />
            </Link>
          </>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>

      <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground flex items-center gap-2">
        <Receipt className="h-3 w-3" />
        <span>MGSIS Analytics · v0.1 · build {new Date().getFullYear()}</span>
      </div>
    </aside>
  );
}
