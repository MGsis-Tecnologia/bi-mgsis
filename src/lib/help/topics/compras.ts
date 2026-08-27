import { TrendingDown } from "lucide-react";
import type { HelpSection } from "../types";

export const compras: HelpSection = {
  id: "compras",
  group: "Visão",
  label: "Análise de Compras",
  route: "/compras",
  icon: TrendingDown,
  summary: "\"Como compramos.\" — evolução temporal, sazonalidade, fornecedores e a lista de compras mais recentes.",
  globalFilters:
    "Período, empresa e moeda. Diferente de Vendas, esta tela NÃO tem filtro de canal, vendedor nem subgrupo — compra não tem canal nem vendedor no ERP, e o cruzamento por subgrupo fica na tela Fornecedores.",
  metrics: [
    {
      id: "fonte",
      title: "De onde vem o dado",
      description: "Toda a tela usa a mesma origem: itens de compra importados (não a mesma view de vendas).",
      logic: "Fonte é a tabela de itens de compra, agrupada por data, fornecedor e produto.",
    },
    {
      id: "evolucao",
      title: "Evolução temporal",
      description: "Série do total comprado ao longo do tempo, com abas de granularidade.",
    },
    {
      id: "sazonalidade",
      title: "Sazonalidade · dia × semana",
      description: "Mesma lógica do mapa de calor de Vendas, aplicada ao valor comprado.",
    },
    {
      id: "fornecedores",
      title: "Gasto por fornecedor",
      description: "Ranking dos fornecedores por valor comprado no período.",
      filters: "Para a curva ABC completa de fornecedores e o cruzamento com produtos, use a tela Fornecedores.",
    },
    {
      id: "compras-recentes",
      title: "Últimas compras",
      description: "Tabela com as compras mais recentes: fornecedor, itens, total e data.",
      logic:
        "valor médio = total ÷ número de itens; ticket médio = total ÷ número de pedidos distintos (documento de compra). O KPI de topo desconsidera linhas de valor zero ou negativo (ajustes/estornos) — mas as séries dos gráficos, não.",
    },
  ],
};
