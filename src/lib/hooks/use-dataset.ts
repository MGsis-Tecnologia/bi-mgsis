"use client";

import * as React from "react";
import { useDatasetStore } from "@/lib/store/dataset";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import { useFilters } from "@/lib/store/filters";
import { isInRange } from "@/lib/utils/dates";
import type {
  ImportedOrder,
  ImportedLineItem,
  ImportedProduct,
  ImportedClient,
  ImportedSeller,
  OrderLineItem,
} from "@/lib/types/dataset";

// ─── Aggregate raw lines into ImportedOrder[] applying currency mode ──────────

function buildOrders(
  items: OrderLineItem[],
  rates: Record<string, number>,
  currencyMode: string,
  empresaMode: string
): ImportedOrder[] {
  const map = new Map<string, ImportedOrder>();

  for (const item of items) {
    // Empresa filter: skip items that don't match when a specific empresa is selected
    if (empresaMode !== "all" && item.empresaId !== empresaMode) continue;
    // Currency filter: skip items that don't match when a specific currency is selected
    if (currencyMode !== "ALL" && item.currencyId !== currencyMode) continue;

    const convRate = currencyMode === "ALL" ? (rates[item.currencyId] ?? 1) : 1;
    const totalDisplay = item.totalOrig * convRate;
    const costDisplay = item.costOrig * convRate;
    const discountDisplay = (item.discountOrig ?? 0) * convRate;

    const lineItem: ImportedLineItem = {
      productId: item.productId,
      productName: item.productName,
      subgroupId: item.subgroupId,
      subgroupName: item.subgroupName,
      quantity: item.quantity,
      totalBRL: totalDisplay,
      costBRL: costDisplay,
    };

    const existing = map.get(item.orderId);
    if (existing) {
      existing.totalBRL += totalDisplay;
      existing.costBRL += costDisplay;
      existing.discountBRL += discountDisplay;
      existing.profitBRL = existing.totalBRL - existing.costBRL;
      existing.marginPct = existing.totalBRL > 0 ? existing.profitBRL / existing.totalBRL : 0;
      existing.discountPct =
        existing.totalBRL + existing.discountBRL > 0
          ? existing.discountBRL / (existing.totalBRL + existing.discountBRL)
          : 0;
      existing.items.push(lineItem);
      // Garante que clientCity está definido (usa a primeira ocorrência não-vazia)
      if (!existing.clientCity && item.clientCity) {
        existing.clientCity = item.clientCity;
      }
    } else {
      map.set(item.orderId, {
        id: item.orderId,
        date: item.date,
        channel: item.channel,
        clientId: item.clientId,
        clientName: item.clientName,
        clientCity: item.clientCity,
        sellerId: item.sellerId,
        sellerName: item.sellerName,
        currencyId: item.currencyId,
        currencyCode: item.currencyCode,
        empresaId: item.empresaId,
        totalBRL: totalDisplay,
        costBRL: costDisplay,
        profitBRL: totalDisplay - costDisplay,
        marginPct: totalDisplay > 0 ? (totalDisplay - costDisplay) / totalDisplay : 0,
        discountBRL: discountDisplay,
        discountPct:
          totalDisplay + discountDisplay > 0 ? discountDisplay / (totalDisplay + discountDisplay) : 0,
        items: [lineItem],
      });
    }
  }

  return [...map.values()];
}

// ─── Derive catalogues from raw items ─────────────────────────────────────────

function deriveProducts(items: OrderLineItem[]): ImportedProduct[] {
  const map = new Map<string, ImportedProduct>();
  for (const it of items) {
    if (!map.has(it.productId)) {
      map.set(it.productId, {
        id: it.productId,
        name: it.productName,
        subgroupId: it.subgroupId,
        subgroupName: it.subgroupName,
      });
    }
  }
  return [...map.values()];
}

function deriveClients(items: OrderLineItem[]): ImportedClient[] {
  const map = new Map<string, ImportedClient>();
  for (const it of items) {
    if (!map.has(it.clientId)) map.set(it.clientId, { id: it.clientId, name: it.clientName });
  }
  return [...map.values()];
}

function deriveSellers(items: OrderLineItem[]): ImportedSeller[] {
  const map = new Map<string, ImportedSeller>();
  for (const it of items) {
    if (!map.has(it.sellerId)) map.set(it.sellerId, { id: it.sellerId, name: it.sellerName });
  }
  return [...map.values()];
}

function deriveChannels(items: OrderLineItem[]): string[] {
  return [...new Set(items.map((it) => it.channel))].sort();
}

function deriveSubgroups(items: OrderLineItem[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const it of items) {
    if (!map.has(it.subgroupId)) map.set(it.subgroupId, it.subgroupName);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Public hooks ─────────────────────────────────────────────────────────────

const EMPTY_ITEMS: OrderLineItem[] = [];

export interface DatasetView {
  orders: ImportedOrder[];
  products: ImportedProduct[];
  clients: ImportedClient[];
  sellers: ImportedSeller[];
  channels: string[];
  subgroups: { id: string; name: string }[];
  hasData: boolean;
}

export function useDataset(): DatasetView {
  const rawItems = useDatasetStore((s) => s.dataset?.items ?? EMPTY_ITEMS);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const rates = useExchangeRates((s) => s.rates);

  return React.useMemo(() => {
    // PONTO ÚNICO DE FILTRO: a view bi_movimento passou a trazer VENDA e
    // DEVOLUCAO VENDA. Todos os cálculos atuais (KPIs, ABC, vendedores, estoque,
    // séries temporais…) consomem este hook, então filtrar aqui garante que
    // nenhum número existente mude. As devoluções continuam importadas e
    // disponíveis no store bruto (useDatasetStore) para análises futuras.
    // O `?? "VENDA"` cobre dados antigos em cache, gravados antes desta coluna.
    const saleItems = rawItems.filter((it) => (it.orderType ?? "VENDA") === "VENDA");

    if (saleItems.length === 0) {
      return { orders: [], products: [], clients: [], sellers: [], channels: [], subgroups: [], hasData: false };
    }
    const orders = buildOrders(saleItems, rates, currency, empresaId);
    return {
      orders,
      products: deriveProducts(saleItems),
      clients: deriveClients(saleItems),
      sellers: deriveSellers(saleItems),
      channels: deriveChannels(saleItems),
      subgroups: deriveSubgroups(saleItems),
      hasData: true,
    };
  }, [rawItems, rates, currency, empresaId]);
}

// ─── Devoluções (pedido_tipo = DEVOLUCAO VENDA) ───────────────────────────────
// Trilha paralela à de vendas: mesma conversão de moeda, mesmo filtro de empresa
// e mesmos filtros globais. Fica SEPARADA de useDataset de propósito, para não
// interferir em nenhum total de vendas.
// Atenção: os valores vêm POSITIVOS da importação — quem exibe decide o sinal.
export function useReturnOrders(): ImportedOrder[] {
  const rawItems = useDatasetStore((s) => s.dataset?.items ?? EMPTY_ITEMS);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const rates = useExchangeRates((s) => s.rates);

  return React.useMemo(() => {
    const returnItems = rawItems.filter((it) => it.orderType === "DEVOLUCAO VENDA");
    if (returnItems.length === 0) return [];
    return buildOrders(returnItems, rates, currency, empresaId);
  }, [rawItems, rates, currency, empresaId]);
}

export function useFilteredReturns(): ImportedOrder[] {
  const returns = useReturnOrders();
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const subgroupId = useFilters((s) => s.subgroupId);
  const getRange = useFilters((s) => s.getRange);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  return React.useMemo(() => {
    return returns.filter((o) => {
      if (!isInRange(o.date, range)) return false;
      if (channel !== "all" && o.channel.toLowerCase() !== channel.toLowerCase()) return false;
      if (sellerId !== "all" && o.sellerId !== sellerId) return false;
      if (subgroupId !== "all" && !o.items.some((it) => it.subgroupId === subgroupId)) return false;
      return true;
    });
  }, [returns, range, channel, sellerId, subgroupId]);
}

export function useFilteredOrders(): ImportedOrder[] {
  const ds = useDataset();
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const subgroupId = useFilters((s) => s.subgroupId);
  const getRange = useFilters((s) => s.getRange);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  return React.useMemo(() => {
    return ds.orders.filter((o) => {
      if (!isInRange(o.date, range)) return false;
      if (channel !== "all" && o.channel.toLowerCase() !== channel.toLowerCase()) return false;
      if (sellerId !== "all" && o.sellerId !== sellerId) return false;
      if (subgroupId !== "all" && !o.items.some((it) => it.subgroupId === subgroupId)) return false;
      return true;
    });
  }, [ds.orders, range, channel, sellerId, subgroupId]);
}
