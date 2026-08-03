// Fonte única dos menus sujeitos a permissão por usuário (ver seção 5.1 do
// plano). A chave é o mesmo href usado em src/components/layout/sidebar.tsx.
// Menus fora dessa lista (Configurações, Empresas) não passam por aqui —
// são controlados por role/isMaster, não pela allow-list de usuário comum.
export interface MenuCatalogGroup {
  section: string;
  items: { key: string; label: string }[];
}

export const MENU_CATALOG: MenuCatalogGroup[] = [
  {
    section: "Visão Geral",
    items: [
      { key: "/dashboard", label: "Executivo" },
      { key: "/vendas", label: "Análise de Vendas" },
      { key: "/comparativo", label: "Comparativo Anual" },
      { key: "/prospeccao", label: "Prospecção" },
    ],
  },
  {
    section: "Catálogo",
    items: [
      { key: "/produtos", label: "Produtos" },
      { key: "/estoque", label: "Estoque" },
      { key: "/clientes", label: "Clientes" },
      { key: "/vendedores", label: "Vendedores" },
    ],
  },
  {
    section: "Financeiro",
    items: [
      { key: "/financeiro/dre", label: "DRE" },
      { key: "/financeiro/receber", label: "Contas a Receber" },
      { key: "/financeiro/pagar", label: "Contas a Pagar" },
    ],
  },
  {
    section: "Operação",
    items: [{ key: "/importacao", label: "Importação" }],
  },
];

export const ALL_MENU_KEYS: string[] = MENU_CATALOG.flatMap((g) => g.items.map((i) => i.key));

export function isMenuKey(pathname: string): boolean {
  return ALL_MENU_KEYS.includes(pathname);
}
