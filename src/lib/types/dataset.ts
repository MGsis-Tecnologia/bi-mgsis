// Raw row parsed from CSV/Excel (one per product per order)
export interface OrderLineItem {
  date: Date;
  orderId: string;        // pedido_documento
  channel: string;        // Atacado | Varejo (normalized)
  clientId: string;
  clientName: string;
  productId: string;
  productName: string;
  quantity: number;
  totalOrig: number;      // produto_valor_total in original currency
  costOrig: number;       // produto_valor_custo in original currency
  subgroupId: string;
  subgroupName: string;
  sellerId: string;
  sellerName: string;
  currencyId: string;     // "1" | "2" | "3"
  currencyCode: string;   // "R$" | "US$" | "G$"
}

// Order aggregated from multiple items (one per pedido_documento)
export interface ImportedOrder {
  id: string;             // pedido_documento
  date: string;           // ISO date string (YYYY-MM-DD)
  channel: string;
  clientId: string;
  clientName: string;
  sellerId: string;
  sellerName: string;
  currencyId: string;
  currencyCode: string;
  totalBRL: number;       // display value — original currency OR converted to R$ for ALL mode
  costBRL: number;
  profitBRL: number;
  marginPct: number;
  items: ImportedLineItem[];
}

export interface ImportedLineItem {
  productId: string;
  productName: string;
  subgroupId: string;
  subgroupName: string;
  quantity: number;
  totalBRL: number;       // display value
  costBRL: number;
}

export interface ImportedProduct {
  id: string;
  name: string;
  subgroupId: string;
  subgroupName: string;
}

export interface ImportedClient {
  id: string;
  name: string;
}

export interface ImportedSeller {
  id: string;
  name: string;
}

export interface StoredDataset {
  items: OrderLineItem[];
  importedAt: string;     // ISO
  filename: string;
  rowCount: number;
}

// "1"=R$  "2"=US$  "3"=G$  "ALL"=Todas Moedas (converte para R$)
export type AppCurrencyId = "1" | "2" | "3" | "ALL";

export interface CurrencyConfig {
  id: AppCurrencyId;
  code: string;
  name: string;
  namePt: string;
  decimals: number;
}

export const CURRENCY_OPTIONS: CurrencyConfig[] = [
  { id: "1",   code: "R$",  name: "BRL", namePt: "Real Brasileiro",    decimals: 2 },
  { id: "2",   code: "US$", name: "USD", namePt: "Dólar Americano",    decimals: 2 },
  { id: "3",   code: "G$",  name: "PYG", namePt: "Guarani Paraguaio",  decimals: 0 },
  { id: "ALL", code: "★",   name: "ALL", namePt: "Todas as Moedas",    decimals: 2 },
];

// Fallback rates: 1 unit of currency → R$
// G$: 100,000 G$ = 1,200 R$ → 1 G$ = 0.012 R$
export const FALLBACK_RATES: Record<string, number> = {
  "1": 1,
  "2": 5.00,
  "3": 0.012,
};
