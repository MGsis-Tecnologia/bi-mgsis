import type { ImportedOrder } from "@/lib/types/dataset";

export interface CustomerRFM {
  clientId: string;
  clientName: string;
  recency: number; // days since last purchase
  frequency: number; // total number of purchases
  monetary: number; // total spent in BRL
  rScore: number; // 1-5
  fScore: number; // 1-5
  mScore: number; // 1-5
  rfmScore: string; // concatenated RFM score
  segment: RFMSegment;
}

export type RFMSegment =
  | "Champions"
  | "Loyal Customers"
  | "Potential Loyalists"
  | "At Risk"
  | "Cant Lose Them"
  | "Lost"
  | "New Customers"
  | "Need Attention";

function getRFMSegment(r: number, f: number, m: number): RFMSegment {
  const rfm = `${r}${f}${m}`;

  // Champions & Loyal: high R, high F, high M
  if (r >= 4 && f >= 4 && m >= 4) return "Champions";
  if (r >= 3 && f >= 4 && m >= 3) return "Loyal Customers";

  // Potential Loyalists: good R & F, not highest M
  if (r >= 3 && f >= 3 && m < 3) return "Potential Loyalists";

  // New Customers: high R, low F
  if (r >= 4 && f <= 2) return "New Customers";

  // Need Attention: medium R, medium F/M
  if (r >= 3 && r <= 4 && f >= 2 && f <= 3 && m >= 2 && m <= 3) {
    return "Need Attention";
  }

  // At Risk: low R but had good history
  if (r <= 2 && f >= 3 && m >= 3) return "At Risk";

  // Cant Lose Them: very low R but high M
  if (r <= 1 && m >= 4) return "Cant Lose Them";

  // Lost: very low across board
  if (r <= 1 && f <= 2 && m <= 2) return "Lost";

  // Default fallback
  return "Need Attention";
}

function scoreRecency(daysAgo: number): number {
  // More recent = higher score
  if (daysAgo <= 30) return 5;
  if (daysAgo <= 60) return 4;
  if (daysAgo <= 90) return 3;
  if (daysAgo <= 180) return 2;
  return 1;
}

function scoreFrequency(count: number): number {
  // More purchases = higher score
  if (count >= 10) return 5;
  if (count >= 7) return 4;
  if (count >= 4) return 3;
  if (count >= 2) return 2;
  return 1;
}

function scoreMonetary(amount: number, max: number): number {
  // Higher spend = higher score (percentile-based)
  const percentile = amount / max;
  if (percentile >= 0.8) return 5;
  if (percentile >= 0.6) return 4;
  if (percentile >= 0.4) return 3;
  if (percentile >= 0.2) return 2;
  return 1;
}

export function calculateRFM(orders: ImportedOrder[]): CustomerRFM[] {
  const customerMap: Record<
    string,
    {
      id: string;
      name: string;
      dates: string[];
      count: number;
      total: number;
    }
  > = {};

  // Aggregate by customer
  for (const order of orders) {
    if (!customerMap[order.clientId]) {
      customerMap[order.clientId] = {
        id: order.clientId,
        name: order.clientName,
        dates: [],
        count: 0,
        total: 0,
      };
    }
    customerMap[order.clientId].dates.push(order.date);
    customerMap[order.clientId].count += 1;
    customerMap[order.clientId].total += order.totalBRL;
  }

  // Calculate RFM for each customer
  const today = new Date();
  const rfmData: CustomerRFM[] = [];

  // Find max monetary for scoring
  const maxMonetary = Math.max(
    ...Object.values(customerMap).map((c) => c.total),
    1
  );

  for (const customer of Object.values(customerMap)) {
    const lastDate = new Date(customer.dates[customer.dates.length - 1]);
    const daysAgo = Math.floor(
      (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const rScore = scoreRecency(daysAgo);
    const fScore = scoreFrequency(customer.count);
    const mScore = scoreMonetary(customer.total, maxMonetary);
    const segment = getRFMSegment(rScore, fScore, mScore);

    rfmData.push({
      clientId: customer.id,
      clientName: customer.name,
      recency: daysAgo,
      frequency: customer.count,
      monetary: customer.total,
      rScore,
      fScore,
      mScore,
      rfmScore: `${rScore}${fScore}${mScore}`,
      segment,
    });
  }

  // Sort by RFM score (descending)
  return rfmData.sort((a, b) => {
    const scoreA = a.rScore + a.fScore + a.mScore;
    const scoreB = b.rScore + b.fScore + b.mScore;
    return scoreB - scoreA;
  });
}

export function getSegmentColor(segment: RFMSegment): string {
  switch (segment) {
    case "Champions":
      return "hsl(var(--accent))"; // green/blue
    case "Loyal Customers":
      return "hsl(var(--primary))";
    case "Potential Loyalists":
      return "hsl(var(--chart-2))";
    case "New Customers":
      return "hsl(var(--chart-3))";
    case "Need Attention":
      return "hsl(var(--chart-4))";
    case "At Risk":
      return "hsl(var(--destructive))";
    case "Cant Lose Them":
      return "hsl(var(--chart-5))";
    case "Lost":
      return "hsl(var(--muted-foreground))";
  }
}

export function getSegmentDescription(segment: RFMSegment): string {
  const descriptions: Record<RFMSegment, string> = {
    Champions: "Best customers - high frequency, recent, high spend",
    "Loyal Customers": "Regular customers with good spending",
    "Potential Loyalists": "Good customers who could become loyal",
    "New Customers": "Recently acquired, monitor growth",
    "Need Attention": "Moderate engagement, needs engagement strategy",
    "At Risk": "Previously loyal but haven't purchased recently",
    "Cant Lose Them": "High spenders but haven't purchased recently",
    Lost: "Haven't purchased in long time",
  };
  return descriptions[segment];
}
