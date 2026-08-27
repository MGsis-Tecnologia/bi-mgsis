import { Users } from "lucide-react";
import type { HelpSection } from "../types";

export const clientes: HelpSection = {
  id: "clientes",
  group: "Catálogo",
  label: "Clientes",
  route: "/clientes",
  icon: Users,
  summary: "\"Quem compra.\" — segmentação RFM, LTV, ranking de clientes e a base completa de clientes.",
  globalFilters: "Período, empresa, moeda, canal, vendedor e subgrupo se aplicam normalmente.",
  metrics: [
    {
      id: "ltv",
      title: "Top clientes por LTV",
      description: "Ranking dos clientes com maior valor gerado.",
      logic:
        "\"LTV\" aqui é a receita do cliente DENTRO do período filtrado, não o valor histórico acumulado da vida inteira do cliente — o nome é o mesmo do conceito de mercado, mas o cálculo é sempre relativo ao recorte de tempo escolhido na tela.",
    },
    {
      id: "rfm",
      title: "Segmentação RFM",
      description: "Classifica cada cliente ativo num segmento, combinando recência, frequência e valor de compra.",
      logic:
        "A classificação segue uma ordem de prioridade, na primeira regra que bater: (1) mais de 90 dias sem comprar → \"em risco\"; (2) só uma compra no período → \"novo\"; (3) receita no período ≥ 60% da receita do maior cliente do período → \"vip\"; (4) 5 ou mais pedidos → \"fiel\"; (5) nenhuma das anteriores → \"promissor\". Clientes do histórico que simplesmente não compraram nada no período contam à parte, como \"inativos\".",
      filters:
        "A \"recência\" (dias desde a última compra) é calculada contra a data do computador de quem está olhando a tela, não contra a data do servidor — então o número pode variar por minutos se o relógio do navegador estiver errado.",
      howToRead:
        "\"Em risco\" prioriza sobre todas as outras regras: um cliente que gastou muito mas sumiu há 3 meses aparece como em risco, não como VIP.",
    },
    {
      id: "base-clientes",
      title: "Base de clientes",
      description: "Tabela com todos os clientes do período, seu segmento, receita e frequência.",
    },
    {
      id: "clientes-lucrativos",
      title: "Clientes mais lucrativos",
      description: "Top 25 clientes ordenados por margem de lucro, não por receita.",
      logic: "margem = (receita − custo) ÷ receita, em %.",
    },
    {
      id: "churn-risk",
      title: "Risco de churn",
      description: "Indicador de quantos clientes caem no segmento \"em risco\" (ver Segmentação RFM acima).",
    },
  ],
};
