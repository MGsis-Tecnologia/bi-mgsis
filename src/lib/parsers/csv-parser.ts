import Papa from "papaparse";
import * as XLSX from "xlsx";
import type {
  InventoryItem,
  OrderLineItem,
  PayableItem,
  ReceivableItem,
  StoredDataset,
  StoredInventory,
  StoredPayables,
  StoredReceivables,
} from "@/lib/types/dataset";

// Required column names for the VENDAS layout (lowercase trimmed)
const REQUIRED_COLS = [
  "pedido_data",
  "pedido_documento",
  "pedido_canal",
  "cliente_id",
  "cliente_nome",
  "produto_id",
  "produto_descricao",
  "produto_quantidade",
  "produto_valor_total",
  "produto_valor_custo",
  "subgrupo_id",
  "subgrupo_descricao",
  "vendedor_id",
  "vendedor_nome",
  "moeda_id",
  "moeda_sigla",
  "pedido_tipo",
] as const;

// Required column names for the RECEBER layout (contas a receber)
const RECEIVABLE_REQUIRED_COLS = [
  "moeda_id",
  "moeda_sigla",
  "pessoa_cliente_id",
  "pessoa_nome",
  "data_emissao",
  "data_vencimento",
  "tipolanzamiento",
  "valor_documento",
  "vendedor_id",
  "vendedor_nome",
] as const;

// Required column names for the PAGAR layout (contas a pagar)
const PAYABLE_REQUIRED_COLS = [
  "moeda_id",
  "moeda_sigla",
  "pessoa_fornecedor_id",
  "pessoa_nome",
  "data_vencimento",
  "tipolanzamiento",
  "valor_documento",
] as const;

// Required column names for the ESTOQUE layout (inventory snapshot)
const INVENTORY_REQUIRED_COLS = [
  "produto_id",
  "produto_descricao",
  "produto_fabricante",
  "estoque_item",
  "valor_estoque",
] as const;

export type DatasetKind = "sales" | "receivable" | "payable" | "inventory";

export interface ParseResult {
  kind: DatasetKind | null;
  dataset: StoredDataset | null;          // populated when kind === "sales"
  receivables: StoredReceivables | null;  // populated when kind === "receivable"
  payables: StoredPayables | null;        // populated when kind === "payable"
  inventory: StoredInventory | null;      // populated when kind === "inventory"
  errors: string[];
  warnings: string[];
  skipped: number;
}

function errorResult(errors: string[], warnings: string[] = [], skipped = 0): ParseResult {
  return { kind: null, dataset: null, receivables: null, payables: null, inventory: null, errors, warnings, skipped };
}

// Parse date string → ISO YYYY-MM-DD (string, never a Date object — survives JSON serialization)
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();

  // DD/MM/YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    if (!isNaN(Date.parse(iso))) return iso;
  }

  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    if (!isNaN(Date.parse(iso))) return iso;
  }

  // Excel serial number
  const serial = Number(trimmed);
  if (!isNaN(serial) && serial > 10000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }

  return null;
}

// Parse a numeric field that may use Brazilian formatting (1.234,56 or 1234.56)
function parseNumber(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const s = String(raw).trim().replace(/\s/g, "");
  if (!s) return 0;
  // Brazilian format: dots as thousands, comma as decimal
  if (s.includes(",")) {
    return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return parseFloat(s.replace(/,/g, "")) || 0;
}

// Normalize column header: lowercase, trim, collapse spaces/underscores
function normalizeHeader(h: string): string {
  return String(h).toLowerCase().trim().replace(/\s+/g, "_");
}

// Map raw row object to a typed record using normalized headers
function mapRow(row: Record<string, unknown>, colMap: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [normalized, original] of Object.entries(colMap)) {
    out[normalized] = row[original];
  }
  return out;
}

// ─── Dispatcher: detect layout (VENDAS vs RECEBER) and route ──────────────────

function processRows(rawRows: Record<string, unknown>[], filename: string): ParseResult {
  if (rawRows.length === 0) {
    return errorResult(["Arquivo vazio."]);
  }

  // Build column map: normalized → original header name
  const headers = Object.keys(rawRows[0]!);
  const colMap: Record<string, string> = {};
  for (const h of headers) {
    colMap[normalizeHeader(h)] = h;
  }

  // Layout detection — discriminate by key columns
  if ("pessoa_fornecedor_id" in colMap) {
    return processPayableRows(rawRows, colMap, filename);
  }
  if ("receber_documento" in colMap || ("pessoa_cliente_id" in colMap && "data_vencimento" in colMap)) {
    return processReceivableRows(rawRows, colMap, filename);
  }
  if ("pedido_documento" in colMap || "pedido_tipo" in colMap) {
    return processSalesRows(rawRows, colMap, filename);
  }
  if ("estoque_item" in colMap || ("produto_id" in colMap && "valor_estoque" in colMap)) {
    return processInventoryRows(rawRows, colMap, filename);
  }

  return errorResult([
    "Leiaute não reconhecido. O arquivo deve conter colunas de Vendas (pedido_documento), Contas a Receber (pessoa_cliente_id), Contas a Pagar (pessoa_fornecedor_id) ou Estoque (estoque_item).",
  ]);
}

// ─── VENDAS ───────────────────────────────────────────────────────────────────

function processSalesRows(
  rawRows: Record<string, unknown>[],
  colMap: Record<string, string>,
  filename: string
): ParseResult {
  // Validate required columns
  const missing = REQUIRED_COLS.filter((c) => !(c in colMap));
  if (missing.length > 0) {
    return errorResult([`Colunas obrigatórias ausentes (Vendas): ${missing.join(", ")}`]);
  }

  const items: OrderLineItem[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let rowNum = 1;

  for (const rawRow of rawRows) {
    rowNum++;
    const row = mapRow(rawRow, colMap);

    // Filter: only VENDAS
    const tipo = String(row["pedido_tipo"] ?? "").trim().toUpperCase();
    if (tipo !== "VENDA") { skipped++; continue; }

    // Required string fields
    const orderId   = String(row["pedido_documento"] ?? "").trim();
    const clientId  = String(row["cliente_id"] ?? "").trim();
    const productId = String(row["produto_id"] ?? "").trim();
    if (!orderId || !clientId || !productId) {
      warnings.push(`Linha ${rowNum}: campos chave vazios — ignorada.`);
      skipped++;
      continue;
    }

    const date = parseDate(String(row["pedido_data"] ?? ""));
    if (!date) {
      warnings.push(`Linha ${rowNum}: data inválida "${row["pedido_data"]}" — ignorada.`);
      skipped++;
      continue;
    }

    const currencyId   = String(row["moeda_id"] ?? "1").trim();
    const currencyCode = String(row["moeda_sigla"] ?? "R$").trim();

    const clientCity = String(row["pedido_cidade"] ?? "").trim() || undefined;

    items.push({
      date,
      orderId,
      channel:      String(row["pedido_canal"] ?? "").trim(),
      clientId,
      clientName:   String(row["cliente_nome"] ?? "").trim(),
      clientCity,
      productId,
      productName:  String(row["produto_descricao"] ?? "").trim(),
      quantity:     parseNumber(row["produto_quantidade"] as string),
      totalOrig:    parseNumber(row["produto_valor_total"] as string),
      costOrig:     parseNumber(row["produto_valor_custo"] as string),
      subgroupId:   String(row["subgrupo_id"] ?? "").trim(),
      subgroupName: String(row["subgrupo_descricao"] ?? "").trim(),
      sellerId:     String(row["vendedor_id"] ?? "").trim(),
      sellerName:   String(row["vendedor_nome"] ?? "").trim(),
      currencyId,
      currencyCode,
    });
  }

  if (items.length === 0) {
    return errorResult(["Nenhuma linha válida (pedido_tipo=VENDAS) encontrada."], warnings, skipped);
  }

  return {
    kind: "sales",
    dataset: {
      items,
      importedAt: new Date().toISOString(),
      filename,
      rowCount: items.length,
    },
    receivables: null,
    payables: null,
    inventory: null,
    errors: [],
    warnings: warnings.slice(0, 20),
    skipped,
  };
}

// ─── RECEBER (contas a receber) ───────────────────────────────────────────────

function processReceivableRows(
  rawRows: Record<string, unknown>[],
  colMap: Record<string, string>,
  filename: string
): ParseResult {
  // Validate required columns
  const missing = RECEIVABLE_REQUIRED_COLS.filter((c) => !(c in colMap));
  if (missing.length > 0) {
    return errorResult([`Colunas obrigatórias ausentes (Contas a Receber): ${missing.join(", ")}`]);
  }

  const hasCity = "pessoa_cidade" in colMap;

  const items: ReceivableItem[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let rowNum = 1;

  for (const rawRow of rawRows) {
    rowNum++;
    const row = mapRow(rawRow, colMap);

    // clientId é obrigatório; documentId pode estar vazio — gerado sinteticamente se ausente
    const clientId   = String(row["pessoa_cliente_id"] ?? "").trim();
    if (!clientId) {
      warnings.push(`Linha ${rowNum}: cliente_id vazio — ignorada.`);
      skipped++;
      continue;
    }
    const documentId = String(row["receber_documento"] ?? "").trim() || `row-${rowNum}`;

    // Due date is mandatory — drives the aging analysis
    const dueDate = parseDate(String(row["data_vencimento"] ?? ""));
    if (!dueDate) {
      warnings.push(`Linha ${rowNum}: vencimento inválido "${row["data_vencimento"]}" — ignorada.`);
      skipped++;
      continue;
    }

    // Issue date is best-effort (used only for display)
    const issueDate = parseDate(String(row["data_emissao"] ?? "")) ?? "";

    // Receipt date: present → item is a received payment; absent → still pending
    const receivedDate = parseDate(String(row["data_recebimento"] ?? "")) ?? "";
    const isPaid = receivedDate !== "";

    const amountOrig = parseNumber(row["valor_documento"] as string);
    if (amountOrig === 0) {
      warnings.push(`Linha ${rowNum}: valor do documento zerado — ignorada.`);
      skipped++;
      continue;
    }

    items.push({
      documentId,
      clientId,
      clientName:   String(row["pessoa_nome"] ?? "").trim(),
      clientCity:   hasCity ? (String(row["pessoa_cidade"] ?? "").trim() || undefined) : undefined,
      issueDate,
      dueDate,
      receivedDate,
      isPaid,
      entryType:    String(row["tipolanzamiento"] ?? "").trim(),
      amountOrig,
      sellerId:     String(row["vendedor_id"] ?? "").trim(),
      sellerName:   String(row["vendedor_nome"] ?? "").trim(),
      currencyId:   String(row["moeda_id"] ?? "1").trim(),
      currencyCode: String(row["moeda_sigla"] ?? "R$").trim(),
    });
  }

  if (items.length === 0) {
    return errorResult(["Nenhum título a receber válido encontrado."], warnings, skipped);
  }

  if (!hasCity) {
    warnings.unshift(
      "Coluna 'pessoa_cidade' ausente — a análise por cidade ficará agrupada em 'Sem cidade'."
    );
  }

  return {
    kind: "receivable",
    dataset: null,
    receivables: {
      items,
      importedAt: new Date().toISOString(),
      filename,
      rowCount: items.length,
    },
    payables: null,
    inventory: null,
    errors: [],
    warnings: warnings.slice(0, 20),
    skipped,
  };
}

// ─── PAGAR (contas a pagar) ───────────────────────────────────────────────────

function processPayableRows(
  rawRows: Record<string, unknown>[],
  colMap: Record<string, string>,
  filename: string
): ParseResult {
  const missing = PAYABLE_REQUIRED_COLS.filter((c) => !(c in colMap));
  if (missing.length > 0) {
    return errorResult([`Colunas obrigatórias ausentes (Contas a Pagar): ${missing.join(", ")}`]);
  }

  const items: PayableItem[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let rowNum = 1;

  for (const rawRow of rawRows) {
    rowNum++;
    const row = mapRow(rawRow, colMap);

    const supplierId = String(row["pessoa_fornecedor_id"] ?? "").trim();
    if (!supplierId) {
      warnings.push(`Linha ${rowNum}: fornecedor_id vazio — ignorada.`);
      skipped++;
      continue;
    }

    const documentId = String(row["pagar_documento"] ?? "").trim() || `row-${rowNum}`;

    const dueDate = parseDate(String(row["data_vencimento"] ?? ""));
    if (!dueDate) {
      warnings.push(`Linha ${rowNum}: vencimento inválido "${row["data_vencimento"]}" — ignorada.`);
      skipped++;
      continue;
    }

    const amountOrig = parseNumber(row["valor_documento"] as string);
    if (amountOrig === 0) {
      warnings.push(`Linha ${rowNum}: valor do documento zerado — ignorada.`);
      skipped++;
      continue;
    }

    const issueDate = parseDate(String(row["data_emissao"] ?? "")) ?? "";
    const paidDate  = parseDate(String(row["data_pagamento"] ?? "")) ?? "";
    const isPaid    = paidDate !== "";

    items.push({
      documentId,
      supplierId,
      supplierName: String(row["pessoa_nome"] ?? "").trim(),
      issueDate,
      dueDate,
      paidDate,
      isPaid,
      entryType:    String(row["tipolanzamiento"] ?? "").trim(),
      amountOrig,
      currencyId:   String(row["moeda_id"] ?? "1").trim(),
      currencyCode: String(row["moeda_sigla"] ?? "R$").trim(),
    });
  }

  if (items.length === 0) {
    return errorResult(["Nenhum título a pagar válido encontrado."], warnings, skipped);
  }

  return {
    kind: "payable",
    dataset: null,
    receivables: null,
    payables: {
      items,
      importedAt: new Date().toISOString(),
      filename,
      rowCount: items.length,
    },
    inventory: null,
    errors: [],
    warnings: warnings.slice(0, 20),
    skipped,
  };
}

// ─── ESTOQUE (inventário) ─────────────────────────────────────────────────────

function processInventoryRows(
  rawRows: Record<string, unknown>[],
  colMap: Record<string, string>,
  filename: string
): ParseResult {
  const missing = INVENTORY_REQUIRED_COLS.filter((c) => !(c in colMap));
  if (missing.length > 0) {
    return errorResult([`Colunas obrigatórias ausentes (Estoque): ${missing.join(", ")}`]);
  }

  // Snapshot semantics: if the same SKU appears more than once we keep the last
  // occurrence's stock/cost (assumes ordered export) — but we surface a warning.
  const map = new Map<string, InventoryItem>();
  const warnings: string[] = [];
  let skipped = 0;
  let rowNum = 1;
  let duplicates = 0;

  for (const rawRow of rawRows) {
    rowNum++;
    const row = mapRow(rawRow, colMap);

    const productId = String(row["produto_id"] ?? "").trim();
    if (!productId) {
      warnings.push(`Linha ${rowNum}: produto_id vazio — ignorada.`);
      skipped++;
      continue;
    }

    const stock = parseNumber(row["estoque_item"] as string);
    const costTotalUSD = parseNumber(row["valor_estoque"] as string);

    if (map.has(productId)) duplicates++;

    map.set(productId, {
      productId,
      description:      String(row["produto_descricao"] ?? "").trim(),
      manufacturerCode: String(row["produto_fabricante"] ?? "").trim(),
      stock,
      costTotalUSD,
    });
  }

  const items = [...map.values()];
  if (items.length === 0) {
    return errorResult(["Nenhum item de estoque válido encontrado."], warnings, skipped);
  }

  if (duplicates > 0) {
    warnings.unshift(`${duplicates} SKU(s) duplicado(s) no arquivo — mantida a última ocorrência.`);
  }

  return {
    kind: "inventory",
    dataset: null,
    receivables: null,
    payables: null,
    inventory: {
      items,
      importedAt: new Date().toISOString(),
      filename,
      rowCount: items.length,
    },
    errors: [],
    warnings: warnings.slice(0, 20),
    skipped,
  };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "csv") {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          resolve(processRows(result.data as Record<string, unknown>[], file.name));
        },
        error: (err) => {
          resolve(errorResult([err.message]));
        },
      });
    });
  }

  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });
    return processRows(rows, file.name);
  }

  return errorResult(["Formato não suportado. Use CSV, XLSX ou XLS."]);
}
