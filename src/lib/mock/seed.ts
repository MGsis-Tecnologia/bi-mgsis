import type {
  Channel,
  Customer,
  CustomerSegment,
  ExchangeRate,
  Order,
  OrderItem,
  Product,
  ProductCategory,
  Region,
  Seller,
} from "@/lib/types";
import {
  CITIES_BY_REGION,
  COMPANY_SUFFIXES,
  FIRST_NAMES,
  LAST_NAMES,
  PRODUCT_NAME_POOL,
} from "./catalog";

/* ───────────────────────── PRNG: deterministic, seedable ───────────────────────── */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260518);
const between = (min: number, max: number) => min + rand() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const pickWeighted = <T,>(items: { v: T; w: number }[]): T => {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rand() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.v;
  }
  return items[items.length - 1]!.v;
};

/* ───────────────────────── Constants ───────────────────────── */
const REGIONS: Region[] = ["sudeste", "sul", "centro-oeste", "nordeste", "norte"];
const REGION_WEIGHTS = [55, 22, 8, 12, 3];
const CATEGORIES: ProductCategory[] = [
  "eletronicos",
  "moda",
  "casa-decoracao",
  "esporte-lazer",
  "beleza-saude",
  "alimentos-bebidas",
  "livros-midia",
];
const CHANNELS: Channel[] = ["ecommerce", "marketplace", "loja-fisica", "b2b", "telemarketing"];
const CHANNEL_WEIGHTS = [40, 25, 18, 12, 5];

const CATEGORY_PRICE_RANGE: Record<ProductCategory, [number, number]> = {
  eletronicos: [180, 9200],
  moda: [89, 1800],
  "casa-decoracao": [120, 6500],
  "esporte-lazer": [70, 4500],
  "beleza-saude": [29, 480],
  "alimentos-bebidas": [18, 320],
  "livros-midia": [22, 280],
};

const CATEGORY_MARGIN: Record<ProductCategory, [number, number]> = {
  eletronicos: [0.12, 0.28],
  moda: [0.4, 0.62],
  "casa-decoracao": [0.32, 0.55],
  "esporte-lazer": [0.25, 0.45],
  "beleza-saude": [0.48, 0.68],
  "alimentos-bebidas": [0.18, 0.35],
  "livros-midia": [0.22, 0.4],
};

/* ───────────────────────── Currencies ───────────────────────── */
export const EXCHANGE_RATES: ExchangeRate[] = [
  { code: "BRL", rateToBRL: 1, symbol: "R$", name: "Real" },
  { code: "USD", rateToBRL: 5.08, symbol: "$", name: "Dólar Americano" },
  { code: "EUR", rateToBRL: 5.42, symbol: "€", name: "Euro" },
  { code: "GBP", rateToBRL: 6.34, symbol: "£", name: "Libra" },
];

/* ───────────────────────── Generators ───────────────────────── */
function genProducts(n: number): Product[] {
  const products: Product[] = [];
  let idx = 0;
  for (const cat of CATEGORIES) {
    const names = PRODUCT_NAME_POOL[cat];
    const count = Math.floor((n / CATEGORIES.length) + intBetween(-3, 3));
    for (let i = 0; i < count; i++) {
      const base = names[i % names.length]!;
      const variant = i >= names.length ? ` ${["Plus", "Max", "Edition", "Slim", "Pro"][i % 5]}` : "";
      const [pmin, pmax] = CATEGORY_PRICE_RANGE[cat];
      const sale = Math.round(between(pmin, pmax) * 100) / 100;
      const [mmin, mmax] = CATEGORY_MARGIN[cat];
      const margin = between(mmin, mmax);
      const cost = Math.round(sale * (1 - margin) * 100) / 100;
      products.push({
        id: `prod_${idx.toString().padStart(4, "0")}`,
        sku: `SKU-${cat.slice(0, 3).toUpperCase()}-${(1000 + idx).toString()}`,
        name: `${base}${variant}`,
        category: cat,
        costPriceBRL: cost,
        salePriceBRL: sale,
        stock: intBetween(0, 480),
      });
      idx++;
    }
  }
  return products;
}

function genCustomers(n: number): Customer[] {
  const customers: Customer[] = [];
  const today = Date.now();
  for (let i = 0; i < n; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const isCompany = rand() < 0.18;
    const name = isCompany
      ? `${last} ${pick(COMPANY_SUFFIXES)}`
      : `${first} ${last}`;
    const region = pickWeighted(REGIONS.map((r, i) => ({ v: r, w: REGION_WEIGHTS[i]! })));
    const city = pick(CITIES_BY_REGION[region]);
    const daysAgo = intBetween(2, 900);
    customers.push({
      id: `cust_${i.toString().padStart(4, "0")}`,
      code: `C${(10000 + i).toString()}`,
      name,
      email: `${first.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${last.toLowerCase()}@${isCompany ? "corp.com" : "email.com"}`,
      region,
      segment: "novo",
      registeredAt: new Date(today - daysAgo * 86400000).toISOString(),
      city,
    });
  }
  return customers;
}

function genSellers(n: number): Seller[] {
  const sellers: Seller[] = [];
  for (let i = 0; i < n; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    sellers.push({
      id: `sell_${i.toString().padStart(3, "0")}`,
      code: `V${(100 + i).toString()}`,
      name: `${first} ${last}`,
      region: pickWeighted(REGIONS.map((r, i) => ({ v: r, w: REGION_WEIGHTS[i]! }))),
      monthlyGoalBRL: intBetween(80, 320) * 1000,
      commissionRate: Math.round(between(0.015, 0.05) * 1000) / 1000,
      hiredAt: new Date(Date.now() - intBetween(60, 2000) * 86400000).toISOString(),
    });
  }
  return sellers;
}

/* Seasonality multiplier: ramp through year, Black Friday spike, December peak */
function seasonality(date: Date): number {
  const m = date.getMonth(); // 0..11
  const d = date.getDate();
  const dayOfWeek = date.getDay();
  // base monthly multipliers
  const monthMult = [0.78, 0.74, 0.85, 0.9, 0.95, 0.98, 1.0, 1.02, 1.05, 1.1, 1.28, 1.42][m]!;
  // Black Friday boost (last week of November)
  const bfBoost = m === 10 && d >= 22 && d <= 30 ? 1.6 : 1;
  // Weekend discount on B2B days
  const weekendDip = dayOfWeek === 0 || dayOfWeek === 6 ? 0.82 : 1.05;
  // small noise
  const noise = 0.9 + rand() * 0.2;
  return monthMult * bfBoost * weekendDip * noise;
}

function genOrders({
  products,
  customers,
  sellers,
  totalOrders,
  monthsBack,
}: {
  products: Product[];
  customers: Customer[];
  sellers: Seller[];
  totalOrders: number;
  monthsBack: number;
}): Order[] {
  const orders: Order[] = [];
  const now = new Date();
  const endTs = now.getTime();
  const startTs = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1).getTime();
  const span = endTs - startTs;

  // Pre-bucket products by category & price tier for realistic mixes
  const productsByCategory: Record<ProductCategory, Product[]> = {} as never;
  for (const c of CATEGORIES) productsByCategory[c] = products.filter((p) => p.category === c);

  // Heavy-tail: 80/20 active customers
  const heavyCustomers = customers.slice(0, Math.floor(customers.length * 0.2));
  const allCustomers = customers;

  for (let i = 0; i < totalOrders; i++) {
    const ts = startTs + Math.floor(rand() * span);
    const date = new Date(ts);
    const mult = seasonality(date);

    // Skip some via seasonality (compress low-activity periods)
    if (rand() > Math.min(mult * 0.9, 1)) {
      continue;
    }

    const customer = rand() < 0.62 ? pick(heavyCustomers) : pick(allCustomers);
    const seller = pick(sellers);
    const region = customer.region;
    const city = customer.city;
    const channel = pickWeighted(CHANNELS.map((c, i) => ({ v: c, w: CHANNEL_WEIGHTS[i]! })));

    // 1–6 items per order, basket size correlates with channel
    const itemCount =
      channel === "b2b"
        ? intBetween(2, 8)
        : channel === "ecommerce"
        ? intBetween(1, 4)
        : intBetween(1, 3);

    const items: OrderItem[] = [];
    // pick a "primary" category for this basket
    const primaryCat = pick(CATEGORIES);
    for (let k = 0; k < itemCount; k++) {
      const cat = rand() < 0.7 ? primaryCat : pick(CATEGORIES);
      const pool = productsByCategory[cat];
      if (!pool || pool.length === 0) continue;
      const product = pick(pool);
      const qty = channel === "b2b" ? intBetween(1, 12) : intBetween(1, 3);
      const discountPct = rand() < 0.35 ? Math.round(between(0.03, 0.18) * 1000) / 1000 : 0;
      items.push({
        productId: product.id,
        quantity: qty,
        unitPriceBRL: product.salePriceBRL,
        unitCostBRL: product.costPriceBRL,
        discountPct,
      });
    }
    if (items.length === 0) continue;

    const subtotal = items.reduce((s, it) => s + it.unitPriceBRL * it.quantity, 0);
    const discount = items.reduce(
      (s, it) => s + it.unitPriceBRL * it.quantity * it.discountPct,
      0
    );
    const shipping = channel === "loja-fisica" ? 0 : Math.round(between(12, 89) * 100) / 100;
    const total = Math.round((subtotal - discount + shipping) * 100) / 100;
    const cost = items.reduce((s, it) => s + it.unitCostBRL * it.quantity, 0);
    const profit = Math.round((total - shipping - cost) * 100) / 100;
    const marginPct = total > 0 ? profit / (total - shipping) : 0;

    const status: Order["status"] =
      rand() < 0.04 ? "cancelado" : rand() < 0.03 ? "devolvido" : rand() < 0.06 ? "pendente" : "pago";

    orders.push({
      id: `ord_${i.toString().padStart(5, "0")}`,
      number: `#${(100000 + i).toString()}`,
      customerId: customer.id,
      sellerId: seller.id,
      channel,
      region,
      city,
      date: date.toISOString(),
      items,
      subtotalBRL: Math.round(subtotal * 100) / 100,
      discountBRL: Math.round(discount * 100) / 100,
      shippingBRL: shipping,
      totalBRL: total,
      costBRL: Math.round(cost * 100) / 100,
      profitBRL: profit,
      marginPct: Math.round(marginPct * 10000) / 10000,
      status,
    });
  }

  // Sort chronologically
  orders.sort((a, b) => a.date.localeCompare(b.date));
  return orders;
}

/* ───────────────────────── RFM-based segmentation ───────────────────────── */
function segmentCustomers(customers: Customer[], orders: Order[]): Customer[] {
  const now = Date.now();
  const stats = new Map<string, { recency: number; freq: number; monetary: number }>();

  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const days = (now - new Date(o.date).getTime()) / 86400000;
    const cur = stats.get(o.customerId) ?? { recency: Infinity, freq: 0, monetary: 0 };
    cur.recency = Math.min(cur.recency, days);
    cur.freq += 1;
    cur.monetary += o.totalBRL;
    stats.set(o.customerId, cur);
  }

  // Quantile thresholds (simple) for freq & monetary
  const freqs = [...stats.values()].map((s) => s.freq).sort((a, b) => a - b);
  const mons = [...stats.values()].map((s) => s.monetary).sort((a, b) => a - b);
  const q = (arr: number[], p: number) =>
    arr.length ? arr[Math.floor(arr.length * p)] ?? 0 : 0;
  const freqHi = q(freqs, 0.75);
  const monHi = q(mons, 0.75);

  return customers.map((c) => {
    const s = stats.get(c.id);
    let segment: CustomerSegment;
    if (!s) segment = "novo";
    else if (s.recency > 180) segment = "inativo";
    else if (s.recency > 90 && s.freq >= 2) segment = "em-risco";
    else if (s.freq >= freqHi && s.monetary >= monHi) segment = "vip";
    else if (s.freq >= 3) segment = "fiel";
    else if (s.freq >= 2) segment = "promissor";
    else segment = "novo";
    return { ...c, segment };
  });
}

/* ───────────────────────── Build dataset ───────────────────────── */
export interface Dataset {
  products: Product[];
  customers: Customer[];
  sellers: Seller[];
  orders: Order[];
  exchangeRates: ExchangeRate[];
}

let _cache: Dataset | null = null;

export function getDataset(): Dataset {
  if (_cache) return _cache;
  const products = genProducts(200);
  const customersBase = genCustomers(500);
  const sellers = genSellers(20);
  const orders = genOrders({
    products,
    customers: customersBase,
    sellers,
    totalOrders: 5400,
    monthsBack: 12,
  });
  const customers = segmentCustomers(customersBase, orders);
  _cache = { products, customers, sellers, orders, exchangeRates: EXCHANGE_RATES };
  return _cache;
}
