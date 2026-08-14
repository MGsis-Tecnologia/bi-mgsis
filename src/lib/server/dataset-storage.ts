import type { PrismaClient } from "@prisma/client";
import type {
  OrderLineItem,
  ReceivableItem,
  PayableItem,
  InventoryItem,
  CaixaItem,
  OrcamentoLineItem,
  CompraLineItem,
  CambioLinha,
} from "@/lib/types/dataset";

export type DatasetKind =
  | "sales" | "receivable" | "payable" | "inventory" | "caixa" | "orcamento"
  | "compras" | "cambio";

const VALID_KINDS = new Set<DatasetKind>([
  "sales", "receivable", "payable", "inventory", "caixa", "orcamento", "compras", "cambio",
]);

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

export async function getMeta(db: PrismaClient, kind: DatasetKind): Promise<DatasetMeta | null> {
  const row = await db.datasetMeta.findUnique({ where: { kind } });
  if (!row) return null;
  return { kind: row.kind as DatasetKind, filename: row.filename, rowCount: row.rowCount, importedAt: row.importedAt };
}

export async function upsertMeta(db: PrismaClient, meta: DatasetMeta): Promise<void> {
  await db.datasetMeta.upsert({
    where: { kind: meta.kind },
    create: { kind: meta.kind, filename: meta.filename, rowCount: meta.rowCount, importedAt: meta.importedAt },
    update: { filename: meta.filename, rowCount: meta.rowCount, importedAt: meta.importedAt },
  });
}

export async function deleteMeta(db: PrismaClient, kind: DatasetKind): Promise<void> {
  await db.datasetMeta.deleteMany({ where: { kind } });
}

// ---------------------------------------------------------------------------
// Row operations — clear
// ---------------------------------------------------------------------------

export async function clearRows(db: PrismaClient, kind: DatasetKind): Promise<void> {
  switch (kind) {
    case "sales":      await db.saleItem.deleteMany({}); break;
    case "receivable": await db.receivableItem.deleteMany({}); break;
    case "payable":    await db.payableItem.deleteMany({}); break;
    case "inventory":  await db.inventoryItem.deleteMany({}); break;
    case "caixa":      await db.caixaItem.deleteMany({}); break;
    case "orcamento":  await db.orcamentoItem.deleteMany({}); break;
    case "compras":    await db.compraItem.deleteMany({}); break;
    // `cambio_diario` não é limpa aqui: ela é reconstruída inteira depois da
    // importação (ver server/ingest/cambio.ts). Apagá-la agora deixaria as
    // telas sem cotação nenhuma no intervalo entre o DELETE e a reconstrução.
    case "cambio":     await db.cambio.deleteMany({}); break;
  }
}

export async function deleteDataset(db: PrismaClient, kind: DatasetKind): Promise<void> {
  await clearRows(db, kind);
  await deleteMeta(db, kind);
}

// ---------------------------------------------------------------------------
// Row operations — batch insert (max ~3 000 rows por call)
// ---------------------------------------------------------------------------

/**
 * Sem log por lote: a importação de vendas faz ~284 chamadas destas, e o
 * progresso de verdade fica no `import_jobs` (ver server/importacao). Quatro
 * linhas de console por lote só enterrariam o que interessa no log do container.
 */
export async function insertRows(db: PrismaClient, kind: DatasetKind, rows: unknown[]): Promise<number> {
  if (!rows.length) return 0;

  try {
    switch (kind) {
      case "sales":
        return (await db.saleItem.createMany({ data: rows as OrderLineItem[] })).count;
      case "receivable":
        return (await db.receivableItem.createMany({ data: rows as ReceivableItem[] })).count;
      case "payable":
        return (await db.payableItem.createMany({ data: rows as PayableItem[] })).count;
      case "inventory":
        return (await db.inventoryItem.createMany({ data: rows as InventoryItem[] })).count;
      case "caixa":
        return (await db.caixaItem.createMany({ data: rows as CaixaItem[] })).count;
      case "orcamento":
        return (await db.orcamentoItem.createMany({ data: rows as OrcamentoLineItem[] })).count;
      case "compras":
        return (await db.compraItem.createMany({ data: rows as CompraLineItem[] })).count;
      case "cambio":
        // `skipDuplicates`: a chave é (data, origem, destino), e o ERP repete a
        // mesma cotação em lotes diferentes do mesmo arquivo. A normalização
        // por lote não enxerga isso — só o banco enxerga.
        return (
          await db.cambio.createMany({ data: rows as CambioLinha[], skipDuplicates: true })
        ).count;
    }
  } catch (e) {
    console.error(`❌ Erro ao inserir ${kind}:`, e);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Row operations — paginated read
// ---------------------------------------------------------------------------

export async function getRows(db: PrismaClient, kind: DatasetKind, skip: number, take: number): Promise<unknown[]> {
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
    case "compras":
      return (await db.compraItem.findMany({ skip, take, orderBy: { id: "asc" } })).map(
        ({ id: _id, ...rest }) => rest
      );
    // Câmbio não tem `id`: a chave é (data, origem, destino), e é por ela que a
    // paginação ordena — sem uma ordem total, `skip` repetiria linhas.
    case "cambio":
      return db.cambio.findMany({
        skip,
        take,
        orderBy: [{ data: "asc" }, { moedaOrigem: "asc" }, { moedaDestino: "asc" }],
      });
  }
}

// ---------------------------------------------------------------------------
// Summary helpers (used by existing /api/datasets route)
// ---------------------------------------------------------------------------

export async function summarize(db: PrismaClient, kind: DatasetKind): Promise<DatasetSummary> {
  const meta = await getMeta(db, kind);
  if (!meta) return { kind, present: false };
  return { kind, present: true, filename: meta.filename, rowCount: meta.rowCount, importedAt: meta.importedAt };
}

export async function summarizeAll(db: PrismaClient): Promise<DatasetSummary[]> {
  return Promise.all([...VALID_KINDS].map((k) => summarize(db, k)));
}
