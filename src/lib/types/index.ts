export type CurrencyCode = "BRL" | "USD" | "EUR" | "GBP";

export type Channel = "ecommerce" | "marketplace" | "loja-fisica" | "b2b" | "telemarketing";

export type Region = "sudeste" | "sul" | "centro-oeste" | "nordeste" | "norte";

export type ProductCategory =
  | "eletronicos"
  | "moda"
  | "casa-decoracao"
  | "esporte-lazer"
  | "beleza-saude"
  | "alimentos-bebidas"
  | "livros-midia";

export type CustomerSegment = "vip" | "fiel" | "promissor" | "novo" | "em-risco" | "inativo";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  costPriceBRL: number;
  salePriceBRL: number;
  stock: number;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  email: string;
  region: Region;
  segment: CustomerSegment;
  registeredAt: string; // ISO
  city: string;
}

export interface Seller {
  id: string;
  code: string;
  name: string;
  region: Region;
  monthlyGoalBRL: number;
  commissionRate: number;
  hiredAt: string; // ISO
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPriceBRL: number;
  unitCostBRL: number;
  discountPct: number;
}

export interface Order {
  id: string;
  number: string;
  customerId: string;
  sellerId: string;
  channel: Channel;
  region: Region;
  date: string; // ISO date
  items: OrderItem[];
  subtotalBRL: number;
  discountBRL: number;
  shippingBRL: number;
  totalBRL: number;
  costBRL: number;
  profitBRL: number;
  marginPct: number;
  status: "pago" | "pendente" | "cancelado" | "devolvido";
}

export interface ExchangeRate {
  code: CurrencyCode;
  rateToBRL: number; // 1 unit = X BRL
  symbol: string;
  name: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export type DatePreset =
  | "hoje"
  | "ontem"
  | "7d"
  | "30d"
  | "mes-atual"
  | "ano-atual"
  | "12m"
  | "custom";
