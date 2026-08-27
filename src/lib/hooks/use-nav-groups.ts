import * as React from "react";
import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  CalendarRange,
  CircleDollarSign,
  HelpCircle,
  LayoutList,
  Mail,
  Package,
  Receipt,
  TrendingDown,
  Truck,
  Upload,
  UserCog,
  Users,
  UserSquare2,
  Wallet,
} from "lucide-react";
import type { DictionaryKey } from "@/lib/i18n/dictionaries";

/**
 * Lista de navegação e a lógica de permissão por papel — usada tanto pela
 * sidebar de desktop (`components/layout/sidebar.tsx`) quanto pelo menu
 * mobile (`components/layout/mobile-nav.tsx`). Fica num hook à parte porque
 * são DUAS telas mostrando o mesmo menu: se a regra de permissão morasse
 * dentro de um dos componentes, era questão de tempo até divergir da outra.
 */

export type NavItem = {
  href: string;
  labelKey: DictionaryKey;
  icon: React.ElementType;
};

export type NavGroup = {
  sectionKey: DictionaryKey;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    sectionKey: "sidebar.section.vision",
    items: [
      { href: "/dashboard", labelKey: "sidebar.nav.executive", icon: Activity },
      { href: "/vendas", labelKey: "sidebar.nav.sales_analysis", icon: BarChart3 },
      { href: "/compras", labelKey: "sidebar.nav.purchases_analysis", icon: TrendingDown },
      { href: "/comparativo", labelKey: "sidebar.nav.annual", icon: CalendarRange },
      { href: "/prospeccao", labelKey: "sidebar.nav.prospection", icon: Receipt },
    ],
  },
  {
    sectionKey: "sidebar.section.catalog",
    items: [
      { href: "/produtos", labelKey: "sidebar.nav.products", icon: Package },
      { href: "/estoque", labelKey: "sidebar.nav.stock", icon: Boxes },
      { href: "/clientes", labelKey: "sidebar.nav.customers", icon: Users },
      { href: "/fornecedores", labelKey: "sidebar.nav.suppliers", icon: Truck },
      { href: "/vendedores", labelKey: "sidebar.nav.sellers", icon: UserSquare2 },
    ],
  },
  {
    sectionKey: "sidebar.section.financial",
    items: [
      { href: "/financeiro/dre", labelKey: "sidebar.nav.dre", icon: LayoutList },
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
  {
    sectionKey: "sidebar.section.settings",
    items: [
      { href: "/configuracoes/email", labelKey: "sidebar.nav.smtp", icon: Mail },
    ],
  },
];

// Só aparece pra role "admin" (ou master) — gestão dos usuários da própria empresa.
const NAV_TEAM: NavGroup = {
  sectionKey: "sidebar.section.team",
  items: [
    { href: "/usuarios", labelKey: "sidebar.nav.users", icon: UserCog },
  ],
};

// Só aparece pra sessões com isMaster — gestão de empresas do catalog.
const NAV_MASTER: NavGroup = {
  sectionKey: "sidebar.section.master",
  items: [
    { href: "/master/empresas", labelKey: "sidebar.nav.empresas", icon: Building2 },
  ],
};

// Sempre visível, pra todo mundo — inclusive role "user" com allow-list de
// menus restrita: o que a pessoa pode VER não deveria limitar a ajuda sobre
// aquilo que ela já vê.
const NAV_HELP: NavGroup = {
  sectionKey: "sidebar.section.help",
  items: [
    { href: "/ajuda", labelKey: "sidebar.nav.help", icon: HelpCircle },
  ],
};

const SETTINGS_SECTION_KEY: DictionaryKey = "sidebar.section.settings";

export interface UseNavGroupsOptions {
  isMaster?: boolean;
  role?: string;
  allowedMenus?: string[];
}

export function useNavGroups({ isMaster = false, role, allowedMenus }: UseNavGroupsOptions): NavGroup[] {
  const isAdmin = role === "admin";

  return React.useMemo(() => {
    // Configurações hoje só tem o SMTP, que é uma conta de envio ÚNICA do
    // sistema inteiro — por isso a seção é exclusiva do master. Admin de
    // empresa não deve nem ver que ela existe.
    let groups = isMaster ? NAV : NAV.filter((g) => g.sectionKey !== SETTINGS_SECTION_KEY);

    // role "user": além disso, só enxerga os menus liberados (allow-list).
    if (!isMaster && !isAdmin) {
      const allowed = new Set(allowedMenus ?? []);
      groups = groups
        .map((g) => ({ ...g, items: g.items.filter((i) => allowed.has(i.href)) }))
        .filter((g) => g.items.length > 0);
    }

    if (isAdmin || isMaster) groups = [...groups, NAV_TEAM];
    if (isMaster) groups = [...groups, NAV_MASTER];
    groups = [...groups, NAV_HELP];
    return groups;
  }, [isAdmin, isMaster, allowedMenus]);
}
