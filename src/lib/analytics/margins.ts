import type { ImportedOrder } from "@/lib/types/dataset";

export interface MarginMetrics {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number; // percentage
  profitMarginBps: number; // basis points
  averageOrderMargin: number;
  lowestMargin: number;
  highestMargin: number;
}

export interface ProductMargin {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface SellerMargin {
  sellerId: string;
  sellerName: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  orderCount: number;
  avgMargin: number;
}

export function calculateMarginMetrics(orders: ImportedOrder[]): MarginMetrics {
  let totalRevenue = 0;
  let totalCost = 0;
  let totalProfit = 0;
  const margins: number[] = [];

  for (const order of orders) {
    totalRevenue += order.totalBRL;
    totalCost += order.costBRL;
    totalProfit += order.profitBRL;
    margins.push(order.marginPct);
  }

  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const profitMarginBps = Math.round(profitMargin * 100);

  return {
    totalRevenue,
    totalCost,
    totalProfit,
    profitMargin,
    profitMarginBps,
    averageOrderMargin: margins.length > 0 ? margins.reduce((a, b) => a + b) / margins.length : 0,
    lowestMargin: margins.length > 0 ? Math.min(...margins) : 0,
    highestMargin: margins.length > 0 ? Math.max(...margins) : 0,
  };
}

export function calculateProductMargins(orders: ImportedOrder[]): ProductMargin[] {
  const productMap: Record<
    string,
    {
      name: string;
      quantity: number;
      revenue: number;
      cost: number;
    }
  > = {};

  for (const order of orders) {
    for (const item of order.items) {
      if (!productMap[item.productId]) {
        productMap[item.productId] = {
          name: item.productName,
          quantity: 0,
          revenue: 0,
          cost: 0,
        };
      }
      productMap[item.productId].quantity += item.quantity;
      productMap[item.productId].revenue += item.totalBRL;
      productMap[item.productId].cost += item.costBRL;
    }
  }

  return Object.entries(productMap)
    .map(([id, data]) => {
      const profit = data.revenue - data.cost;
      const marginPct = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;
      return {
        productId: id,
        productName: data.name,
        quantity: data.quantity,
        revenue: data.revenue,
        cost: data.cost,
        profit,
        marginPct,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

export function calculateSellerMargins(orders: ImportedOrder[]): SellerMargin[] {
  const sellerMap: Record<
    string,
    {
      name: string;
      revenue: number;
      cost: number;
      orderCount: number;
    }
  > = {};

  for (const order of orders) {
    if (!sellerMap[order.sellerId]) {
      sellerMap[order.sellerId] = {
        name: order.sellerName,
        revenue: 0,
        cost: 0,
        orderCount: 0,
      };
    }
    sellerMap[order.sellerId].revenue += order.totalBRL;
    sellerMap[order.sellerId].cost += order.costBRL;
    sellerMap[order.sellerId].orderCount += 1;
  }

  return Object.entries(sellerMap)
    .map(([id, data]) => {
      const profit = data.revenue - data.cost;
      const marginPct = data.revenue > 0 ? (profit / data.revenue) * 100 : 0;
      const avgMargin = data.orderCount > 0 ? marginPct : 0;
      return {
        sellerId: id,
        sellerName: data.name,
        revenue: data.revenue,
        cost: data.cost,
        profit,
        marginPct,
        orderCount: data.orderCount,
        avgMargin,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}
