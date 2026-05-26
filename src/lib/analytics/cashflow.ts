import type { CaixaItem } from "@/lib/types/dataset";

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export interface CashflowKpis {
  ingressos: number;   // sum of positive values
  gastos: number;      // sum of abs(negative) values
  saldo: number;       // ingressos - gastos
  margem: number;      // saldo / ingressos (0 when ingressos = 0)
  count: number;       // total movement count
}

export function computeCashflowKpis(items: CaixaItem[]): CashflowKpis {
  let ingressos = 0;
  let gastos = 0;
  for (const item of items) {
    if (item.valorDocumento > 0) ingressos += item.valorDocumento;
    else gastos += Math.abs(item.valorDocumento);
  }
  const saldo = ingressos - gastos;
  const margem = ingressos > 0 ? saldo / ingressos : 0;
  return { ingressos, gastos, saldo, margem, count: items.length };
}

// ─── Time series ──────────────────────────────────────────────────────────────

export interface TimeSeriesRow {
  key: string;       // "2024-12" (monthly) or "2024-12-25" (daily)
  label: string;     // "Dez/24" or "25/12"
  ingressos: number;
  gastos: number;
  saldo: number;
}

export function cashflowTimeSeries(
  items: CaixaItem[],
  mode: "monthly" | "daily"
): TimeSeriesRow[] {
  const map = new Map<string, TimeSeriesRow>();

  for (const item of items) {
    const key =
      mode === "monthly"
        ? item.date.slice(0, 7)          // "2024-12"
        : item.date.slice(0, 10);        // "2024-12-25"

    let row = map.get(key);
    if (!row) {
      const label =
        mode === "monthly"
          ? buildMonthLabel(key)
          : buildDayLabel(key);
      row = { key, label, ingressos: 0, gastos: 0, saldo: 0 };
      map.set(key, row);
    }

    if (item.valorDocumento > 0) {
      row.ingressos += item.valorDocumento;
    } else {
      row.gastos += Math.abs(item.valorDocumento);
    }
    row.saldo = row.ingressos - row.gastos;
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function buildMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const idx = parseInt(m!, 10) - 1;
  return `${months[idx]}/${String(y!).slice(2)}`;
}

function buildDayLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

// ─── DRE (hierarchical by plano_conta_codigo) ─────────────────────────────────

export interface DreRow {
  planoContaId: string;
  planoContaCodigo: string;
  planoContaDescricao: string;
  level: number;           // nesting depth derived from code (1.1 → 2, 1.1.01 → 3)
  ingressos: number;
  gastos: number;
  saldo: number;
  isParent: boolean;       // true when there are children with this prefix
  children?: DreRow[];
}

export function buildDre(items: CaixaItem[]): DreRow[] {
  // Aggregate by plano_conta_codigo
  const aggMap = new Map<string, {
    id: string;
    codigo: string;
    descricao: string;
    ingressos: number;
    gastos: number;
  }>();

  for (const item of items) {
    const key = item.planoContaCodigo || item.planoContaId || "?";
    let agg = aggMap.get(key);
    if (!agg) {
      agg = {
        id: item.planoContaId,
        codigo: item.planoContaCodigo,
        descricao: item.planoContaDescricao,
        ingressos: 0,
        gastos: 0,
      };
      aggMap.set(key, agg);
    }
    if (item.valorDocumento > 0) agg.ingressos += item.valorDocumento;
    else agg.gastos += Math.abs(item.valorDocumento);
  }

  // Build flat rows with level derived from code segments
  const flat: DreRow[] = [...aggMap.values()].map((agg) => {
    const segments = agg.codigo ? agg.codigo.split(".") : ["?"];
    const level = segments.length;
    return {
      planoContaId: agg.id,
      planoContaCodigo: agg.codigo,
      planoContaDescricao: agg.descricao,
      level,
      ingressos: agg.ingressos,
      gastos: agg.gastos,
      saldo: agg.ingressos - agg.gastos,
      isParent: false,
    };
  });

  // Sort by code then build parent totals
  flat.sort((a, b) => a.planoContaCodigo.localeCompare(b.planoContaCodigo));

  // Mark parents: any row whose code is a prefix of another row's code
  const codes = new Set(flat.map((r) => r.planoContaCodigo));
  for (const row of flat) {
    for (const other of flat) {
      if (other.planoContaCodigo !== row.planoContaCodigo &&
          other.planoContaCodigo.startsWith(row.planoContaCodigo + ".")) {
        row.isParent = true;
        break;
      }
    }
  }

  // For parent rows that have no direct items, sum their children
  for (const row of flat) {
    if (row.isParent) {
      const children = flat.filter(
        (r) =>
          r.planoContaCodigo !== row.planoContaCodigo &&
          r.planoContaCodigo.startsWith(row.planoContaCodigo + ".")
      );
      // Only add children values if parent itself has no direct movements
      if (row.ingressos === 0 && row.gastos === 0) {
        for (const child of children) {
          row.ingressos += child.ingressos;
          row.gastos += child.gastos;
        }
        row.saldo = row.ingressos - row.gastos;
      }
    }
  }

  // Return only rows that have at least some movement (after propagation)
  // but always include parents so hierarchy is visible
  return flat.filter(
    (r) => r.ingressos > 0 || r.gastos > 0 || (codes.size > 0 && r.isParent)
  );
}

// ─── Expense breakdown for pie chart ─────────────────────────────────────────

export interface ExpenseSlice {
  name: string;
  value: number;
  pct: number;
}

const SMALL_THRESHOLD = 0.04; // group accounts < 4% of total into "GASTOS VÁRIOS"

export function expenseBreakdown(items: CaixaItem[]): ExpenseSlice[] {
  const map = new Map<string, number>();

  for (const item of items) {
    if (item.valorDocumento >= 0) continue; // skip income
    const key = item.planoContaDescricao || "Sem categoria";
    map.set(key, (map.get(key) ?? 0) + Math.abs(item.valorDocumento));
  }

  const total = [...map.values()].reduce((s, v) => s + v, 0);
  if (total === 0) return [];

  const main: ExpenseSlice[] = [];
  let others = 0;

  for (const [name, value] of map.entries()) {
    if (value / total < SMALL_THRESHOLD) {
      others += value;
    } else {
      main.push({ name, value, pct: value / total });
    }
  }

  if (others > 0) {
    main.push({ name: "GASTOS VÁRIOS", value: others, pct: others / total });
  }

  return main.sort((a, b) => b.value - a.value);
}

// ─── Top cost centers ─────────────────────────────────────────────────────────

export interface CentroCustoRow {
  id: string;
  descricao: string;
  ingressos: number;
  gastos: number;
  saldo: number;
}

export function byCentroCusto(items: CaixaItem[]): CentroCustoRow[] {
  const map = new Map<string, CentroCustoRow>();
  for (const item of items) {
    const key = item.centroCustoId || "?";
    let row = map.get(key);
    if (!row) {
      row = {
        id: item.centroCustoId,
        descricao: item.centroCustoDescricao || item.centroCustoId,
        ingressos: 0,
        gastos: 0,
        saldo: 0,
      };
      map.set(key, row);
    }
    if (item.valorDocumento > 0) row.ingressos += item.valorDocumento;
    else row.gastos += Math.abs(item.valorDocumento);
    row.saldo = row.ingressos - row.gastos;
  }
  return [...map.values()].sort((a, b) => b.gastos - a.gastos);
}
