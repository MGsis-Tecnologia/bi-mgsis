import type { Order, Product } from "@/lib/types";
import { computeKpis, revenueByCategory } from "./kpis";
import { monthlySeries } from "./timeseries";
import type { DateRange } from "@/lib/types";
import { previousComparableRange, isInRange } from "@/lib/utils/dates";
import { formatPercent } from "@/lib/utils/format";

export interface Insight {
  id: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  title: string;
  body: string;
  metric?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  eletronicos: "Eletrônicos",
  moda: "Moda",
  "casa-decoracao": "Casa & Decoração",
  "esporte-lazer": "Esporte & Lazer",
  "beleza-saude": "Beleza & Saúde",
  "alimentos-bebidas": "Alimentos & Bebidas",
  "livros-midia": "Livros & Mídia",
};

export function generateInsights(
  orders: Order[],
  products: Product[],
  range: DateRange
): Insight[] {
  const insights: Insight[] = [];
  const productCat = new Map(products.map((p) => [p.id, p.category]));

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
      id: "revenue-trend",
      tone,
      title: `Receita ${verb} ${formatPercent(Math.abs(d), { decimals: 1 })} vs. período anterior`,
      body:
        d > 0
          ? "O ritmo de faturamento acelerou em relação ao período comparável. Avalie reforçar estoque das categorias líderes."
          : "Houve perda de tração no faturamento. Recomenda-se revisar campanhas ativas e níveis de desconto.",
      metric: `Δ ${formatPercent(d, { signed: true, decimals: 1 })}`,
    });
  }

  // 2. Strongest category
  const rbc = revenueByCategory(cur, productCat);
  const sortedCats = Object.entries(rbc).sort((a, b) => b[1] - a[1]);
  if (sortedCats.length > 0) {
    const [topCat, topRev] = sortedCats[0]!;
    const total = sortedCats.reduce((s, [, v]) => s + v, 0);
    const share = total > 0 ? topRev / total : 0;
    insights.push({
      id: "top-category",
      tone: "neutral",
      title: `${CATEGORY_LABELS[topCat] ?? topCat} concentra ${formatPercent(share, { decimals: 0 })} da receita`,
      body: "Categoria líder do período. Considere aprofundar análise de margem e giro nesta linha.",
      metric: CATEGORY_LABELS[topCat] ?? topCat,
    });
  }

  // 3. Margin alert
  if (k.marginPct < 0.18 && k.revenue > 0) {
    insights.push({
      id: "margin-alert",
      tone: "warning",
      title: `Margem operacional em ${formatPercent(k.marginPct, { decimals: 1 })}`,
      body: "Patamar abaixo da banda saudável. Verifique descontos médios praticados e custo de aquisição.",
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
        title:
          d > 0
            ? `Ticket médio subiu ${formatPercent(d, { decimals: 1 })}`
            : `Ticket médio caiu ${formatPercent(Math.abs(d), { decimals: 1 })}`,
        body:
          d > 0
            ? "Clientes adquiriram baskets mais robustos no período. Cross-sell parece eficaz."
            : "Baskets menores podem indicar pressão promocional ou mix com menor valor agregado.",
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
          title:
            d > 0
              ? `Último mês superou o anterior em ${formatPercent(d, { decimals: 1 })}`
              : `Desaceleração de ${formatPercent(Math.abs(d), { decimals: 1 })} no último mês`,
          body:
            d > 0
              ? "Tendência positiva de curto prazo. Mantenha investimento nas alavancas comerciais ativas."
              : "Queda mensal relevante. Vale investigar canais e regiões impactados.",
        });
      }
    }
  }

  return insights.slice(0, 5);
}
