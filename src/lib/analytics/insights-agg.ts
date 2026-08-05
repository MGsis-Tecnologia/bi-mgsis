import type { Insight } from "./insights";
import { formatPercent } from "@/lib/utils/format";

/**
 * Mesmos insights de `generateInsights`, porém a partir dos números já
 * agregados pelo servidor em vez da lista de pedidos.
 *
 * O conteúdo (títulos, textos, limiares e ordem) é idêntico ao original — só a
 * origem dos dados muda. Os cinco insights dependem apenas de KPI atual, KPI
 * anterior, receita por subgrupo e série mensal, todos já devolvidos pelo
 * endpoint, então não é preciso trafegar pedido nenhum para montá-los.
 */
export interface InsightInput {
  revenue: number;
  averageTicket: number;
  marginPct: number;
  previousRevenue: number;
  previousAverageTicket: number;
  /** Receita por subgrupo no período, em qualquer ordem. */
  subgroups: { label: string; value: number }[];
  /** Série mensal do período, em ordem cronológica. */
  monthly: { revenue: number }[];
}

export function insightsFromAggregates(i: InsightInput): Insight[] {
  const insights: Insight[] = [];

  // 1. Tendência de receita
  if (i.previousRevenue > 0) {
    const d = (i.revenue - i.previousRevenue) / i.previousRevenue;
    const tone = d > 0 ? "positive" : "negative";
    const verb = d > 0 ? "cresceu" : "recuou";
    insights.push({
      id: "revenue-trend",
      tone,
      title: `Receita ${verb} ${formatPercent(Math.abs(d), { decimals: 1 })} vs. período anterior`,
      body:
        d > 0
          ? "O ritmo de faturamento acelerou em relação ao período comparável. Avalie reforçar estoque dos subgrupos líderes."
          : "Houve perda de tração no faturamento. Recomenda-se revisar campanhas ativas e mix de produtos.",
      metric: `Δ ${formatPercent(d, { signed: true, decimals: 1 })}`,
    });
  }

  // 2. Subgrupo líder
  const ordenados = [...i.subgroups].sort((a, b) => b.value - a.value);
  if (ordenados.length > 0) {
    const top = ordenados[0]!;
    const total = ordenados.reduce((s, v) => s + v.value, 0);
    const share = total > 0 ? top.value / total : 0;
    insights.push({
      id: "top-subgroup",
      tone: "neutral",
      title: `${top.label} concentra ${formatPercent(share, { decimals: 0 })} da receita`,
      body: "Subgrupo líder do período. Considere aprofundar análise de margem e giro nesta linha.",
      metric: top.label,
    });
  }

  // 3. Alerta de margem
  if (i.marginPct < 0.18 && i.revenue > 0) {
    insights.push({
      id: "margin-alert",
      tone: "warning",
      title: `Margem operacional em ${formatPercent(i.marginPct, { decimals: 1 })}`,
      body: "Patamar abaixo da banda saudável. Verifique custo dos produtos e preços praticados.",
      metric: formatPercent(i.marginPct),
    });
  }

  // 4. Tendência de ticket
  if (i.previousAverageTicket > 0) {
    const d = (i.averageTicket - i.previousAverageTicket) / i.previousAverageTicket;
    if (Math.abs(d) > 0.05) {
      insights.push({
        id: "ticket-trend",
        tone: d > 0 ? "positive" : "neutral",
        title:
          d > 0
            ? `Ticket médio subiu ${formatPercent(d, { decimals: 1 })}`
            : `Ticket médio caiu ${formatPercent(Math.abs(d), { decimals: 1 })}`,
        body:
          d > 0
            ? "Pedidos com valor maior no período. Estratégia de mix ou canal está funcionando."
            : "Pedidos menores podem indicar pressão de preço ou mix de menor valor agregado.",
        metric: `Δ ${formatPercent(d, { signed: true, decimals: 1 })}`,
      });
    }
  }

  // 5. Momento do último mês
  if (i.monthly.length >= 3) {
    const last = i.monthly[i.monthly.length - 1]!.revenue;
    const prevM = i.monthly[i.monthly.length - 2]!.revenue;
    if (prevM > 0) {
      const d = (last - prevM) / prevM;
      if (Math.abs(d) > 0.1) {
        insights.push({
          id: "momentum",
          tone: d > 0 ? "positive" : "warning",
          title:
            d > 0
              ? `Último mês superou o anterior em ${formatPercent(d, { decimals: 1 })}`
              : `Desaceleração de ${formatPercent(Math.abs(d), { decimals: 1 })} no último mês`,
          body:
            d > 0
              ? "Tendência positiva de curto prazo. Mantenha as alavancas comerciais ativas."
              : "Queda mensal relevante. Vale investigar canais e subgrupos impactados.",
        });
      }
    }
  }

  return insights.slice(0, 5);
}
