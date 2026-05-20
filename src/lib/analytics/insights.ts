import type { ImportedOrder } from "@/lib/types/dataset";
import type { DateRange } from "@/lib/types";
import { computeKpis, revenueBySubgroup } from "./kpis";
import { monthlySeries } from "./timeseries";
import { previousComparableRange, isInRange } from "@/lib/utils/dates";
import { formatPercent } from "@/lib/utils/format";

export interface Insight {
  id: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  title: string;
  body: string;
  metric?: string;
}

export function generateInsights(orders: ImportedOrder[], range: DateRange): Insight[] {
  const insights: Insight[] = [];

  const cur = orders.filter((o) => isInRange(o.date, range));
  const prevRange = previousComparableRange(range);
  const prev = orders.filter((o) => isInRange(o.date, prevRange));
  const k = computeKpis(cur);
  const kp = computeKpis(prev);

  // 1. Revenue trend
  if (kp.revenue > 0) {
    const d = (k.revenue - kp.revenue) / kp.revenue;
    const tone = d > 0 ? "positive" : "negative";
    const verb = d > 0 ? "cresceu" : "recuou";
    insights.push({
      id: "revenue-trend", tone,
      title: `Receita ${verb} ${formatPercent(Math.abs(d), { decimals: 1 })} vs. período anterior`,
      body: d > 0
        ? "O ritmo de faturamento acelerou em relação ao período comparável. Avalie reforçar estoque dos subgrupos líderes."
        : "Houve perda de tração no faturamento. Recomenda-se revisar campanhas ativas e mix de produtos.",
      metric: `Δ ${formatPercent(d, { signed: true, decimals: 1 })}`,
    });
  }

  // 2. Top subgroup
  const rbs = revenueBySubgroup(cur);
  const sortedSubs = Object.values(rbs).sort((a, b) => b.value - a.value);
  if (sortedSubs.length > 0) {
    const top = sortedSubs[0]!;
    const total = sortedSubs.reduce((s, v) => s + v.value, 0);
    const share = total > 0 ? top.value / total : 0;
    insights.push({
      id: "top-subgroup", tone: "neutral",
      title: `${top.label} concentra ${formatPercent(share, { decimals: 0 })} da receita`,
      body: "Subgrupo líder do período. Considere aprofundar análise de margem e giro nesta linha.",
      metric: top.label,
    });
  }

  // 3. Margin alert
  if (k.marginPct < 0.18 && k.revenue > 0) {
    insights.push({
      id: "margin-alert", tone: "warning",
      title: `Margem operacional em ${formatPercent(k.marginPct, { decimals: 1 })}`,
      body: "Patamar abaixo da banda saudável. Verifique custo dos produtos e preços praticados.",
      metric: formatPercent(k.marginPct),
    });
  }

  // 4. Ticket trend
  if (kp.averageTicket > 0) {
    const d = (k.averageTicket - kp.averageTicket) / kp.averageTicket;
    if (Math.abs(d) > 0.05) {
      insights.push({
        id: "ticket-trend",
        tone: d > 0 ? "positive" : "neutral",
        title: d > 0
          ? `Ticket médio subiu ${formatPercent(d, { decimals: 1 })}`
          : `Ticket médio caiu ${formatPercent(Math.abs(d), { decimals: 1 })}`,
        body: d > 0
          ? "Pedidos com valor maior no período. Estratégia de mix ou canal está funcionando."
          : "Pedidos menores podem indicar pressão de preço ou mix de menor valor agregado.",
        metric: `Δ ${formatPercent(d, { signed: true, decimals: 1 })}`,
      });
    }
  }

  // 5. Monthly momentum
  const series = monthlySeries(cur, range);
  if (series.length >= 3) {
    const last = series[series.length - 1]!.revenue;
    const prevM = series[series.length - 2]!.revenue;
    if (prevM > 0) {
      const d = (last - prevM) / prevM;
      if (Math.abs(d) > 0.1) {
        insights.push({
          id: "momentum",
          tone: d > 0 ? "positive" : "warning",
          title: d > 0
            ? `Último mês superou o anterior em ${formatPercent(d, { decimals: 1 })}`
            : `Desaceleração de ${formatPercent(Math.abs(d), { decimals: 1 })} no último mês`,
          body: d > 0
            ? "Tendência positiva de curto prazo. Mantenha as alavancas comerciais ativas."
            : "Queda mensal relevante. Vale investigar canais e subgrupos impactados.",
        });
      }
    }
  }

  return insights.slice(0, 5);
}
