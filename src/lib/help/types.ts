import type { LucideIcon } from "lucide-react";

export type HelpMetric = {
  /** slug único dentro da seção — usado como âncora (id do Card) e alvo de busca */
  id: string;
  /** nome exatamente como aparece na tela (título do card/gráfico/tabela) */
  title: string;
  /** o que o gráfico/tabela/indicador mostra */
  description: string;
  /** como é calculado, em linguagem simples — sem jargão de código */
  logic?: string;
  /** quais filtros (globais e/ou locais da tela) afetam este item */
  filters?: string;
  /** dica de interpretação, armadilha comum, ou "o que fazer quando ver isso" */
  howToRead?: string;
  /** só pra tabelas densas: o que cada COLUNA significa, na ordem em que aparece na tela */
  columns?: { name: string; desc: string }[];
};

export type HelpSection = {
  /** slug, usado na URL (?t=) e como chave da lista de tópicos */
  id: string;
  /** agrupamento — mesmo texto das seções da sidebar (Visão, Catálogo, Financeiro, Operação) */
  group: string;
  /** nome do menu, igual ao rótulo da sidebar */
  label: string;
  /** rota real da tela, para o link "Abrir tela" */
  route: string;
  /** mesmo ícone usado na sidebar, por consistência visual */
  icon: LucideIcon;
  /** intro de 2-4 linhas: pra que serve a tela */
  summary: string;
  /** quais filtros globais (empresa/moeda/período/canal/vendedor/subgrupo) valem aqui, e exceções */
  globalFilters: string;
  /** filtros específicos da própria tela (abas, busca, cliques em card) */
  localFilters?: string;
  /** um item por gráfico/KPI/tabela relevante da tela */
  metrics: HelpMetric[];
};
