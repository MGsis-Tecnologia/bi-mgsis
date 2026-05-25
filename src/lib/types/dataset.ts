// Raw row parsed from CSV/Excel (one per product per order)
export interface OrderLineItem {
  date: string;           // ISO date YYYY-MM-DD — stored as string to survive JSON serialization
  orderId: string;        // pedido_documento
  channel: string;        // Atacado | Varejo (normalized)
  clientId: string;
  clientName: string;
  clientCity?: string;    // pedido_cidade (optional)
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
  clientCity?: string;    // pedido_cidade (optional)
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

// ─── Contas a receber (accounts receivable) ──────────────────────────────────
// One row per open title (receber_documento). The file is a snapshot of the
// open portfolio — every row is a pending receivable.
export interface ReceivableItem {
  documentId: string;     // receber_documento (synthetic "row-N" when absent)
  clientId: string;       // pessoa_cliente_id
  clientName: string;     // pessoa_nome
  clientCity?: string;    // pessoa_cidade (optional column)
  issueDate: string;      // data_emissao — ISO YYYY-MM-DD ("" if absent/invalid)
  dueDate: string;        // data_vencimento — ISO YYYY-MM-DD
  receivedDate: string;   // data_recebimento — ISO YYYY-MM-DD, "" when pending
  isPaid: boolean;        // true when receivedDate is present
  entryType: string;      // tipolanzamiento — classification only
  amountOrig: number;     // valor_documento: received amount when isPaid, pending amount otherwise
  sellerId: string;       // vendedor_id
  sellerName: string;     // vendedor_nome
  currencyId: string;     // moeda_id — "1" | "2" | "3"
  currencyCode: string;   // moeda_sigla — "R$" | "US$" | "G$"
}

export interface StoredReceivables {
  items: ReceivableItem[];
  importedAt: string;     // ISO
  filename: string;
  rowCount: number;
}

// ─── Estoque (inventory snapshot) ────────────────────────────────────────────
// One row per SKU — a point-in-time photograph of on-hand stock.
// productId is the same identifier used in OrderLineItem.productId, allowing
// sales movement to be joined to inventory by SKU.
export interface InventoryItem {
  productId: string;          // produto_id — matches OrderLineItem.productId
  description: string;        // produto_descricao
  manufacturerCode: string;   // produto_fabricante — manufacturer/supplier reference
  stock: number;              // estoque_item — quantity on hand
  costTotalUSD: number;       // valor_estoque — total stock cost in US$
}

export interface StoredInventory {
  items: InventoryItem[];
  importedAt: string;         // ISO
  filename: string;
  rowCount: number;
}

// ─── Contas a pagar (accounts payable) ───────────────────────────────────────
export interface PayableItem {
  documentId: string;     // pagar_documento (synthetic "row-N" when absent)
  supplierId: string;     // pessoa_fornecedor_id
  supplierName: string;   // pessoa_nome
  issueDate: string;      // data_emissao — ISO YYYY-MM-DD ("" if absent/invalid)
  dueDate: string;        // data_vencimento — ISO YYYY-MM-DD
  paidDate: string;       // data_pagamento — ISO YYYY-MM-DD, "" when pending
  isPaid: boolean;        // true when paidDate is present
  entryType: string;      // tipolanzamiento
  amountOrig: number;     // valor_documento: paid amount when isPaid, pending otherwise
  currencyId: string;     // moeda_id
  currencyCode: string;   // moeda_sigla
}

export interface StoredPayables {
  items: PayableItem[];
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
