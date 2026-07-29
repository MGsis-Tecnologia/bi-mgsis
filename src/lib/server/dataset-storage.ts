import { getPrisma } from "./db";
import type {
  OrderLineItem,
  ReceivableItem,
  PayableItem,
  InventoryItem,
  CaixaItem,
  OrcamentoLineItem,
} from "@/lib/types/dataset";

export type DatasetKind = "sales" | "receivable" | "payable" | "inventory" | "caixa" | "orcamento";

const VALID_KINDS = new Set<DatasetKind>(["sales", "receivable", "payable", "inventory", "caixa", "orcamento"]);

export function isValidKind(s: string): s is DatasetKind {
  return VALID_KINDS.has(s as DatasetKind);
}

export interface DatasetMeta {
  kind: DatasetKind;
  filename: string;
  rowCount: number;
  importedAt: string;
}

export interface DatasetSummary {
  kind: DatasetKind;
  present: boolean;
  filename?: string;
  rowCount?: number;
  importedAt?: string;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function getMeta(kind: DatasetKind): Promise<DatasetMeta | null> {
  const db = await getPrisma();
  const row = await db.datasetMeta.findUnique({ where: { kind } });
  if (!row) return null;
  return { kind: row.kind as DatasetKind, filename: row.filename, rowCount: row.rowCount, importedAt: row.importedAt };
}

export async function upsertMeta(meta: DatasetMeta): Promise<void> {
  const db = await getPrisma();
  await db.datasetMeta.upsert({
    where: { kind: meta.kind },
    create: { kind: meta.kind, filename: meta.filename, rowCount: meta.rowCount, importedAt: meta.importedAt },
    update: { filename: meta.filename, rowCount: meta.rowCount, importedAt: meta.importedAt },
  });
}

export async function deleteMeta(kind: DatasetKind): Promise<void> {
  const db = await getPrisma();
  await db.datasetMeta.deleteMany({ where: { kind } });
}

// ---------------------------------------------------------------------------
// Row operations — clear
// ---------------------------------------------------------------------------

export async function clearRows(kind: DatasetKind): Promise<void> {
  const db = await getPrisma();
  switch (kind) {
    case "sales":      await db.saleItem.deleteMany({}); break;
    case "receivable": await db.receivableItem.deleteMany({}); break;
    case "payable":    await db.payableItem.deleteMany({}); break;
    case "inventory":  await db.inventoryItem.deleteMany({}); break;
    case "caixa":      await db.caixaItem.deleteMany({}); break;
    case "orcamento":  await db.orcamentoItem.deleteMany({}); break;
  }
}

export async function deleteDataset(kind: DatasetKind): Promise<void> {
  await clearRows(kind);
  await deleteMeta(kind);
}

// ---------------------------------------------------------------------------
// Row operations — batch insert (max ~3 000 rows per call)
// ---------------------------------------------------------------------------

export async function insertRows(kind: DatasetKind, rows: unknown[]): Promise<number> {
  if (!rows.length) return 0;
  console.log(`🔗 Conectando ao banco para ${kind}...`);
  const db = await getPrisma();
  console.log(`✅ Banco conectado`);

  try {
    switch (kind) {
      case "sales": {
        console.log(`📥 Inserindo ${rows.length} vendas...`);
        const r = await db.saleItem.createMany({ data: rows as OrderLineItem[] });
        console.log(`✅ ${r.count} vendas inseridas`);
        return r.count;
      }
      case "receivable": {
        console.log(`📥 Inserindo ${rows.length} contas a receber...`);
        const r = await db.receivableItem.createMany({ data: rows as ReceivableItem[] });
        console.log(`✅ ${r.count} contas inseridas`);
        return r.count;
      }
      case "payable": {
        console.log(`📥 Inserindo ${rows.length} contas a pagar...`);
        const r = await db.payableItem.createMany({ data: rows as PayableItem[] });
        console.log(`✅ ${r.count} contas inseridas`);
        return r.count;
      }
      case "inventory": {
        console.log(`📥 Inserindo ${rows.length} itens de estoque...`);
        const r = await db.inventoryItem.createMany({ data: rows as InventoryItem[] });
        console.log(`✅ ${r.count} itens inseridos`);
        return r.count;
      }
      case "caixa": {
        console.log(`📥 Inserindo ${rows.length} movimentações...`);
        const r = await db.caixaItem.createMany({ data: rows as CaixaItem[] });
        console.log(`✅ ${r.count} movimentações inseridas`);
        return r.count;
      }
      case "orcamento": {
        console.log(`📥 Inserindo ${rows.length} itens de orçamento...`);
        const r = await db.orcamentoItem.createMany({ data: rows as OrcamentoLineItem[] });
        console.log(`✅ ${r.count} itens de orçamento inseridos`);
        return r.count;
      }
    }
  } catch (e) {
    console.error(`❌ Erro ao inserir ${kind}:`, e);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Row operations — paginated read
// ---------------------------------------------------------------------------

export async function getRows(kind: DatasetKind, skip: number, take: number): Promise<unknown[]> {
  const db = await getPrisma();
  switch (kind) {
    case "sales":
      return (await db.saleItem.findMany({ skip, take, orderBy: { id: "asc" } })).map(
        ({ id: _id, ...rest }) => rest
      );
    case "receivable":
      return (await db.receivableItem.findMany({ skip, take, orderBy: { id: "asc" } })).map(
        ({ id: _id, ...rest }) => rest
      );
    case "payable":
      return (await db.payableItem.findMany({ skip, take, orderBy: { id: "asc" } })).map(
        ({ id: _id, ...rest }) => rest
      );
    case "inventory":
      return (await db.inventoryItem.findMany({ skip, take, orderBy: { id: "asc" } })).map(
        ({ id: _id, ...rest }) => rest
      );
    case "caixa":
      return (await db.caixaItem.findMany({ skip, take, orderBy: { id: "asc" } })).map(
        ({ id: _id, ...rest }) => rest
      );
    case "orcamento":
      return (await db.orcamentoItem.findMany({ skip, take, orderBy: { id: "asc" } })).map(
        ({ id: _id, ...rest }) => rest
      );
  }
}

// ---------------------------------------------------------------------------
// Summary helpers (used by existing /api/datasets route)
// ---------------------------------------------------------------------------

export async function summarize(kind: DatasetKind): Promise<DatasetSummary> {
  const meta = await getMeta(kind);
  if (!meta) return { kind, present: false };
  return { kind, present: true, filename: meta.filename, rowCount: meta.rowCount, importedAt: meta.importedAt };
}

export async function summarizeAll(): Promise<DatasetSummary[]> {
  return Promise.all([...VALID_KINDS].map((k) => summarize(k)));
}
