import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { OrderLineItem, StoredDataset } from "@/lib/types/dataset";

// Required column names (lowercase trimmed)
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

export interface ParseResult {
  dataset: StoredDataset | null;
  errors: string[];
  warnings: string[];
  skipped: number;
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

function processRows(
  rawRows: Record<string, unknown>[],
  filename: string
): ParseResult {
  if (rawRows.length === 0) {
    return { dataset: null, errors: ["Arquivo vazio."], warnings: [], skipped: 0 };
  }

  // Build column map: normalized → original header name
  const headers = Object.keys(rawRows[0]!);
  const colMap: Record<string, string> = {};
  for (const h of headers) {
    colMap[normalizeHeader(h)] = h;
  }

  // Validate required columns
  const missing = REQUIRED_COLS.filter((c) => !(c in colMap));
  if (missing.length > 0) {
    return {
      dataset: null,
      errors: [`Colunas obrigatórias ausentes: ${missing.join(", ")}`],
      warnings: [],
      skipped: 0,
    };
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
    if (tipo !== "VENDAS") { skipped++; continue; }

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

    items.push({
      date,
      orderId,
      channel:      String(row["pedido_canal"] ?? "").trim(),
      clientId,
      clientName:   String(row["cliente_nome"] ?? "").trim(),
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
    return {
      dataset: null,
      errors: ["Nenhuma linha válida (pedido_tipo=VENDAS) encontrada."],
      warnings,
      skipped,
    };
  }

  return {
    dataset: {
      items,
      importedAt: new Date().toISOString(),
      filename,
      rowCount: items.length,
    },
    errors: [],
    warnings: warnings.slice(0, 20), // cap warnings shown
    skipped,
  };
}

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
          resolve({ dataset: null, errors: [err.message], warnings: [], skipped: 0 });
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

  return {
    dataset: null,
    errors: ["Formato não suportado. Use CSV, XLSX ou XLS."],
    warnings: [],
    skipped: 0,
  };
}
