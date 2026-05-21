import type { ImportedOrder } from "@/lib/types/dataset";

export interface CrossSellPair {
  productA: string;
  productAId: string;
  productB: string;
  productBId: string;
  coOccurrences: number;
  confidence: number; // % of A purchases that included B
  support: number; // % of all orders with both A and B
  lift: number; // how much more likely B is bought when A is bought
  revenue: number; // combined revenue from orders with both
}

export interface ProductCoOccurrence {
  productId: string;
  productName: string;
  frequency: number;
  totalOrders: number;
  avgOrderValue: number;
  topPairs: CrossSellPair[];
}

export function calculateCrossSell(orders: ImportedOrder[]): CrossSellPair[] {
  // Count product frequencies and co-occurrences
  const productFreq: Record<string, number> = {};
  const pairOccurrence: Record<string, { count: number; revenue: number }> = {};
  const pairProducts: Record<string, [string, string]> = {};

  for (const order of orders) {
    const productIds = order.items.map((item) => item.productId);
    const uniqueProducts = [...new Set(productIds)];

    // Count individual product frequency
    for (const productId of uniqueProducts) {
      productFreq[productId] = (productFreq[productId] ?? 0) + 1;
    }

    // Count pairs
    for (let i = 0; i < uniqueProducts.length; i++) {
      for (let j = i + 1; j < uniqueProducts.length; j++) {
        const prodA = uniqueProducts[i];
        const prodB = uniqueProducts[j];
        const key = [prodA, prodB].sort().join("|");

        pairOccurrence[key] = {
          count: (pairOccurrence[key]?.count ?? 0) + 1,
          revenue: (pairOccurrence[key]?.revenue ?? 0) + order.totalBRL,
        };

        if (!pairProducts[key]) {
          pairProducts[key] = [prodA, prodB].sort() as [string, string];
        }
      }
    }
  }

  // Build product name map
  const productNames: Record<string, string> = {};
  for (const order of orders) {
    for (const item of order.items) {
      productNames[item.productId] = item.productName;
    }
  }

  // Calculate metrics
  const pairs: CrossSellPair[] = [];

  for (const [key, data] of Object.entries(pairOccurrence)) {
    const [prodAId, prodBId] = pairProducts[key];

    const confidenceA = (data.count / (productFreq[prodAId] ?? 1)) * 100;
    const confidenceB = (data.count / (productFreq[prodBId] ?? 1)) * 100;
    const support = (data.count / orders.length) * 100;

    // Lift: P(B|A) / P(B)
    const probB = (productFreq[prodBId] ?? 1) / orders.length;
    const probBGivenA = data.count / (productFreq[prodAId] ?? 1);
    const lift = probB > 0 ? probBGivenA / probB : 0;

    pairs.push({
      productA: productNames[prodAId],
      productAId: prodAId,
      productB: productNames[prodBId],
      productBId: prodBId,
      coOccurrences: data.count,
      confidence: Math.max(confidenceA, confidenceB),
      support,
      lift,
      revenue: data.revenue,
    });
  }

  // Sort by lift (most strongly correlated)
  return pairs
    .filter((p) => p.coOccurrences >= 2) // only pairs that appear at least twice
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 20); // top 20 pairs
}

export function calculateProductCoOccurrence(
  orders: ImportedOrder[]
): ProductCoOccurrence[] {
  const pairs = calculateCrossSell(orders);
  const productMap: Record<string, ProductCoOccurrence> = {};

  // Initialize products
  for (const order of orders) {
    for (const item of order.items) {
      if (!productMap[item.productId]) {
        productMap[item.productId] = {
          productId: item.productId,
          productName: item.productName,
          frequency: 0,
          totalOrders: 0,
          avgOrderValue: 0,
          topPairs: [],
        };
      }
    }
  }

  // Count frequency
  for (const order of orders) {
    const uniqueProducts = [...new Set(order.items.map((i) => i.productId))];
    for (const productId of uniqueProducts) {
      productMap[productId].frequency += 1;
      productMap[productId].totalOrders += 1;
    }
  }

  // Calculate average order value and assign pairs
  for (const order of orders) {
    const uniqueProducts = [...new Set(order.items.map((i) => i.productId))];
    for (const productId of uniqueProducts) {
      productMap[productId].avgOrderValue = (productMap[productId].avgOrderValue * (productMap[productId].totalOrders - 1) + order.totalBRL) / productMap[productId].totalOrders;
    }
  }

  // Assign top pairs
  for (const pair of pairs) {
    if (productMap[pair.productAId]) {
      if (productMap[pair.productAId].topPairs.length < 3) {
        productMap[pair.productAId].topPairs.push(pair);
      }
    }
    if (productMap[pair.productBId]) {
      const reversePair: CrossSellPair = {
        ...pair,
        productA: pair.productB,
        productAId: pair.productBId,
        productB: pair.productA,
        productBId: pair.productAId,
      };
      if (productMap[pair.productBId].topPairs.length < 3) {
        productMap[pair.productBId].topPairs.push(reversePair);
      }
    }
  }

  return Object.values(productMap)
    .filter((p) => p.frequency > 0)
    .sort((a, b) => b.frequency - a.frequency);
}
