"use client";

import * as React from "react";
import { Boxes, CheckCircle2, CircleDollarSign, Clock, CreditCard, FileSpreadsheet, Landmark, Loader2, ShoppingCart, Trash2, Upload, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseFile, type DatasetKind } from "@/lib/parsers/csv-parser";
import { useDatasetStore, IDB_KEY, RECEIVABLES_IDB_KEY, PAYABLES_IDB_KEY, INVENTORY_IDB_KEY, CAIXA_IDB_KEY, ORCAMENTO_IDB_KEY } from "@/lib/store/dataset";
import { idbSet, idbDel } from "@/lib/store/idb";
import { serverDelete, serverImport } from "@/lib/server/dataset-client";
import { useTranslation } from "@/lib/hooks/use-translation";
import type { DictionaryKey } from "@/lib/i18n/dictionaries";
import { formatNumber, formatDate } from "@/lib/utils/format";

type ItemStatus = "waiting" | "parsing" | "success" | "error";

interface QueueItem {
  id: string;
  filename: string;
  file: File;
  status: ItemStatus;
  kind: DatasetKind | null;
  errors: string[];
  warnings: string[];
  skipped: number;
  rowCount: number;
}

// Rótulo e unidade ("linhas", "títulos", "itens"…) de cada tipo de dado vêm do
// dicionário — as chaves seguem o próprio DatasetKind.
const kindLabelKey = (k: DatasetKind) => `importacao.kind.${k}` as DictionaryKey;
const kindUnitKey  = (k: DatasetKind) => `importacao.unit.${k}` as DictionaryKey;

export default function ImportacaoPage() {
  const { t } = useTranslation();
  const [drag, setDrag] = React.useState(false);
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const queueRef = React.useRef<QueueItem[]>([]);
  const processingRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const {
    dataset, receivables, payables, inventory, caixa, orcamento,
    setDataset, setReceivables, setPayables, setInventory, setCaixa, setOrcamento,
    clearDataset, clearReceivables, clearPayables, clearInventory, clearCaixa, clearOrcamento,
  } = useDatasetStore();

  function updateItem(id: string, patch: Partial<QueueItem>) {
    queueRef.current = queueRef.current.map(i => i.id === id ? { ...i, ...patch } : i);
    setQueue([...queueRef.current]);
  }

  async function processQueue() {
    if (processingRef.current) return;
    processingRef.current = true;

    while (true) {
      const nextItem = queueRef.current.find(i => i.status === "waiting");
      if (!nextItem) break;

      updateItem(nextItem.id, { status: "parsing" });

      const result = await parseFile(nextItem.file);

      if (result.errors.length > 0 || (!result.dataset && !result.receivables && !result.payables && !result.inventory && !result.caixa && !result.orcamento)) {
        updateItem(nextItem.id, {
          status: "error", kind: result.kind,
          errors: result.errors, warnings: result.warnings, skipped: result.skipped,
        });
        continue;
      }

      // Optional advisory when the server persistence fails — IDB remains
      // authoritative for the local browser.
      const serverWarning: string[] = [];
      async function pushToServer(
        kind: DatasetKind,
        items: unknown[],
        meta: { filename: string; rowCount: number; importedAt: string }
      ) {
        try {
          await serverImport(kind, items, meta);
        } catch (err) {
          serverWarning.push(t("importacao.error.server", { msg: (err as Error).message }));
        }
      }

      if (result.kind === "caixa" && result.caixa) {
        await idbSet(CAIXA_IDB_KEY, result.caixa);
        await pushToServer("caixa", result.caixa.items, { filename: result.caixa.filename, rowCount: result.caixa.rowCount, importedAt: result.caixa.importedAt });
        setCaixa(result.caixa);
        updateItem(nextItem.id, {
          status: "success", kind: "caixa",
          rowCount: result.caixa.rowCount,
          warnings: [...result.warnings, ...serverWarning], skipped: result.skipped,
        });
      } else if (result.kind === "inventory" && result.inventory) {
        await idbSet(INVENTORY_IDB_KEY, result.inventory);
        await pushToServer("inventory", result.inventory.items, { filename: result.inventory.filename, rowCount: result.inventory.rowCount, importedAt: result.inventory.importedAt });
        setInventory(result.inventory);
        updateItem(nextItem.id, {
          status: "success", kind: "inventory",
          rowCount: result.inventory.rowCount,
          warnings: [...result.warnings, ...serverWarning], skipped: result.skipped,
        });
      } else if (result.kind === "payable" && result.payables) {
        await idbSet(PAYABLES_IDB_KEY, result.payables);
        await pushToServer("payable", result.payables.items, { filename: result.payables.filename, rowCount: result.payables.rowCount, importedAt: result.payables.importedAt });
        setPayables(result.payables);
        updateItem(nextItem.id, {
          status: "success", kind: "payable",
          rowCount: result.payables.rowCount,
          warnings: [...result.warnings, ...serverWarning], skipped: result.skipped,
        });
      } else if (result.kind === "receivable" && result.receivables) {
        await idbSet(RECEIVABLES_IDB_KEY, result.receivables);
        await pushToServer("receivable", result.receivables.items, { filename: result.receivables.filename, rowCount: result.receivables.rowCount, importedAt: result.receivables.importedAt });
        setReceivables(result.receivables);
        updateItem(nextItem.id, {
          status: "success", kind: "receivable",
          rowCount: result.receivables.rowCount,
          warnings: [...result.warnings, ...serverWarning], skipped: result.skipped,
        });
      } else if (result.kind === "orcamento" && result.orcamento) {
        await idbSet(ORCAMENTO_IDB_KEY, result.orcamento);
        await pushToServer("orcamento", result.orcamento.items, { filename: result.orcamento.filename, rowCount: result.orcamento.rowCount, importedAt: result.orcamento.importedAt });
        setOrcamento(result.orcamento);
        updateItem(nextItem.id, {
          status: "success", kind: "orcamento",
          rowCount: result.orcamento.rowCount,
          warnings: [...result.warnings, ...serverWarning], skipped: result.skipped,
        });
      } else if (result.dataset) {
        await idbSet(IDB_KEY, result.dataset);
        await pushToServer("sales", result.dataset.items, { filename: result.dataset.filename, rowCount: result.dataset.rowCount, importedAt: result.dataset.importedAt });
        setDataset(result.dataset);
        updateItem(nextItem.id, {
          status: "success", kind: "sales",
          rowCount: result.dataset.rowCount,
          warnings: [...result.warnings, ...serverWarning], skipped: result.skipped,
        });
      }
    }

    processingRef.current = false;
  }

  function enqueueFiles(files: File[]) {
    const valid = files.filter(f => /\.(csv|xlsx|xls)$/i.test(f.name));
    if (!valid.length) return;
    const newItems: QueueItem[] = valid.map(f => ({
      id: crypto.randomUUID(),
      filename: f.name,
      file: f,
      status: "waiting",
      kind: null,
      errors: [],
      warnings: [],
      skipped: 0,
      rowCount: 0,
    }));
    queueRef.current = [...queueRef.current, ...newItems];
    setQueue([...queueRef.current]);
    processQueue();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    enqueueFiles(Array.from(e.dataTransfer.files));
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    enqueueFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  const isRunning = queue.some(i => i.status === "waiting" || i.status === "parsing");
  const hasQueue = queue.length > 0;
  const hasDatasets = !!(dataset || receivables || payables || inventory || caixa || orcamento);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("importacao.header.eyebrow")}
        title={t("importacao.header.title")}
        description={t("importacao.header.desc")}
      />

      {/* Drop zone */}
      <Card>
        <CardContent className="p-0">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 transition-colors ${
              drag ? "border-foreground bg-muted/30" : "border-border hover:border-muted-foreground/50 hover:bg-muted/10"
            }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Upload className={`h-5 w-5 ${isRunning ? "animate-pulse text-accent" : "text-muted-foreground"}`} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{t("importacao.upload.title")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("importacao.upload.desc")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("importacao.upload.kinds")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("importacao.upload.multi")}</p>
            </div>
          </div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={onInputChange} />
        </CardContent>
      </Card>

      {/* Import queue */}
      {hasQueue && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <CardTitle className="text-sm">
              {t("importacao.queue.title")}
              {isRunning && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {t("importacao.queue.progress", {
                    done: queue.filter(i => i.status === "success").length,
                    total: queue.length,
                  })}
                </span>
              )}
            </CardTitle>
            {!isRunning && (
              <button
                onClick={() => { queueRef.current = []; setQueue([]); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("importacao.queue.clear")}
              </button>
            )}
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {queue.map(item => (
              <QueueRow key={item.id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Current datasets */}
      {hasDatasets && (
        <Card>
          <CardHeader><CardTitle>{t("importacao.current.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {dataset && (
              <DatasetRow
                icon={<ShoppingCart className="h-4 w-4 text-accent" />}
                kind="sales"
                filename={dataset.filename}
                rowCount={dataset.rowCount}
                importedAt={dataset.importedAt}
                onRemove={async () => { await idbDel(IDB_KEY); await serverDelete("sales"); clearDataset(); }}
              />
            )}
            {receivables && (
              <DatasetRow
                icon={<CircleDollarSign className="h-4 w-4 text-accent" />}
                kind="receivable"
                filename={receivables.filename}
                rowCount={receivables.rowCount}
                importedAt={receivables.importedAt}
                onRemove={async () => { await idbDel(RECEIVABLES_IDB_KEY); await serverDelete("receivable"); clearReceivables(); }}
              />
            )}
            {payables && (
              <DatasetRow
                icon={<CreditCard className="h-4 w-4 text-accent" />}
                kind="payable"
                filename={payables.filename}
                rowCount={payables.rowCount}
                importedAt={payables.importedAt}
                onRemove={async () => { await idbDel(PAYABLES_IDB_KEY); await serverDelete("payable"); clearPayables(); }}
              />
            )}
            {inventory && (
              <DatasetRow
                icon={<Boxes className="h-4 w-4 text-accent" />}
                kind="inventory"
                filename={inventory.filename}
                rowCount={inventory.rowCount}
                importedAt={inventory.importedAt}
                onRemove={async () => { await idbDel(INVENTORY_IDB_KEY); await serverDelete("inventory"); clearInventory(); }}
              />
            )}
            {caixa && (
              <DatasetRow
                icon={<Landmark className="h-4 w-4 text-accent" />}
                kind="caixa"
                filename={caixa.filename}
                rowCount={caixa.rowCount}
                importedAt={caixa.importedAt}
                onRemove={async () => { await idbDel(CAIXA_IDB_KEY); await serverDelete("caixa"); clearCaixa(); }}
              />
            )}
            {orcamento && (
              <DatasetRow
                icon={<FileSpreadsheet className="h-4 w-4 text-accent" />}
                kind="orcamento"
                filename={orcamento.filename}
                rowCount={orcamento.rowCount}
                importedAt={orcamento.importedAt}
                onRemove={async () => { await idbDel(ORCAMENTO_IDB_KEY); await serverDelete("orcamento"); clearOrcamento(); }}
              />
            )}
          </CardContent>
        </Card>
      )}


      {/* Schema reference */}
      <Card>
        <CardHeader><CardTitle>{t("importacao.schema.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <SchemaTable kind="sales" cols={SALES_SCHEMA} />
          <SchemaTable kind="receivable" cols={RECEIVABLE_SCHEMA} />
          <SchemaTable kind="payable" cols={PAYABLE_SCHEMA} />
          <SchemaTable kind="inventory" cols={INVENTORY_SCHEMA} />
          <SchemaTable kind="caixa" cols={CAIXA_SCHEMA} />
          <SchemaTable kind="orcamento" cols={ORCAMENTO_SCHEMA} />
        </CardContent>
      </Card>
    </div>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <div className="mt-0.5 shrink-0">
        {item.status === "waiting" && <Clock className="h-4 w-4 text-muted-foreground" />}
        {item.status === "parsing" && <Loader2 className="h-4 w-4 text-accent animate-spin" />}
        {item.status === "success" && <CheckCircle2 className="h-4 w-4 text-positive" />}
        {item.status === "error" && <XCircle className="h-4 w-4 text-negative" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-foreground truncate">{item.filename}</span>
          {item.status === "waiting" && (
            <span className="text-[11px] text-muted-foreground">{t("importacao.queue.waiting")}</span>
          )}
          {item.status === "parsing" && (
            <span className="text-[11px] text-accent animate-pulse">{t("importacao.queue.processing")}</span>
          )}
          {item.status === "success" && item.kind && (
            <>
              <Badge variant="ghost">{t(kindLabelKey(item.kind))}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {formatNumber(item.rowCount)} {t(kindUnitKey(item.kind))}
              </span>
              {item.skipped > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {t("importacao.queue.skipped", { count: item.skipped })}
                </span>
              )}
            </>
          )}
          {item.status === "error" && (
            <span className="text-[11px] text-negative">{item.errors[0] ?? t("importacao.queue.error")}</span>
          )}
        </div>
        {item.warnings.map((w, i) => (
          <p key={i} className="text-[11px] text-warning">{w}</p>
        ))}
      </div>
    </div>
  );
}

function DatasetRow({
  icon, kind, filename, rowCount, importedAt, onRemove,
}: {
  icon: React.ReactNode;
  kind: DatasetKind;
  filename: string;
  rowCount: number;
  importedAt: string;
  onRemove: () => Promise<void>;
}) {
  const { t } = useTranslation();
  // Apagar milhões de linhas no servidor não é instantâneo — o botão precisa
  // refletir isso, senão parece que o clique não fez nada.
  const [busy, setBusy] = React.useState(false);

  async function handleRemove() {
    if (busy) return;
    setBusy(true);
    try {
      await onRemove();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{t(kindLabelKey(kind))}</span>
            <Badge variant="positive" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />{t("importacao.current.active")}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            <span className="font-mono">{filename}</span>
            {" · "}{formatNumber(rowCount)} {t(kindUnitKey(kind))}
            {" · "}{formatDate(new Date(importedAt), "datetime")}
          </div>
        </div>
      </div>
      <button
        onClick={handleRemove}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-negative hover:border-negative transition-colors shrink-0 disabled:opacity-60 disabled:hover:text-muted-foreground disabled:hover:border-border"
      >
        {busy
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("importacao.current.removing")}</>
          : <><Trash2 className="h-3.5 w-3.5" /> {t("importacao.current.remove")}</>}
      </button>
    </div>
  );
}

// Tipos das colunas dos leiautes — token traduzido em importacao.type.*
type TypeToken =
  | "date" | "date_opt" | "key" | "key_opt" | "text" | "text_opt"
  | "number" | "decimal" | "decimal_opt" | "currency" | "bool";

interface SchemaCol {
  name: string;
  type: TypeToken;
  example: string;
}

function SchemaTable({ kind, cols }: { kind: DatasetKind; cols: SchemaCol[] }) {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground mb-2">
        {t(`importacao.schema.heading.${kind}` as DictionaryKey)}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-6 font-medium text-muted-foreground uppercase tracking-wide">{t("importacao.schema.col")}</th>
              <th className="pb-2 pr-6 font-medium text-muted-foreground uppercase tracking-wide">{t("importacao.schema.type")}</th>
              <th className="pb-2 font-medium text-muted-foreground uppercase tracking-wide">{t("importacao.schema.example")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {cols.map((col) => (
              <tr key={col.name}>
                <td className="py-2 pr-6 font-mono text-foreground">{col.name}</td>
                <td className="py-2 pr-6 text-muted-foreground">{t(`importacao.type.${col.type}` as DictionaryKey)}</td>
                <td className="py-2 text-muted-foreground">{col.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {t(`importacao.schema.note.${kind}` as DictionaryKey)}
      </p>
    </div>
  );
}

const SALES_SCHEMA: SchemaCol[] = [
  { name: "pedido_data",         type: "date",        example: "25/12/2024" },
  { name: "pedido_documento",    type: "key",         example: "PED-00123" },
  { name: "pedido_canal",        type: "text",        example: "Atacado / Varejo" },
  { name: "cliente_id",          type: "key",         example: "CLI-001" },
  { name: "cliente_nome",        type: "text",        example: "Empresa ABC Ltda" },
  { name: "produto_id",          type: "key",         example: "PROD-042" },
  { name: "produto_descricao",   type: "text",        example: "Notebook Pro 15" },
  { name: "produto_quantidade",  type: "number",      example: "2" },
  { name: "produto_valor_total", type: "decimal",     example: "1250,00" },
  { name: "produto_valor_custo", type: "decimal",     example: "900,00" },
  { name: "item_desconto",       type: "decimal_opt", example: "150,00" },
  { name: "subgrupo_id",         type: "key",         example: "SG-05" },
  { name: "subgrupo_descricao",  type: "text",        example: "Informática" },
  { name: "vendedor_id",         type: "key",         example: "VND-003" },
  { name: "vendedor_nome",       type: "text",        example: "João Silva" },
  { name: "moeda_id",            type: "currency",    example: "1" },
  { name: "moeda_sigla",         type: "text",        example: "R$" },
  { name: "pedido_tipo",         type: "text",        example: "VENDA / DEVOLUCAO VENDA" },
  { name: "empresa_id",          type: "key",         example: "1 / 2" },
];

const RECEIVABLE_SCHEMA: SchemaCol[] = [
  { name: "moeda_id",            type: "currency", example: "1" },
  { name: "moeda_sigla",         type: "text",     example: "R$" },
  { name: "pessoa_cliente_id",   type: "key",      example: "CLI-001" },
  { name: "pessoa_nome",         type: "text",     example: "Empresa ABC Ltda" },
  { name: "data_emissao",        type: "date",     example: "25/12/2024" },
  { name: "data_vencimento",     type: "date",     example: "25/01/2025" },
  { name: "receber_documento",   type: "text_opt", example: "DUP-00123" },
  { name: "tipolanzamiento",     type: "text",     example: "Duplicata" },
  { name: "valor_documento",     type: "decimal",  example: "1250,00" },
  { name: "data_recebimento",    type: "date_opt", example: "20/01/2025" },
  { name: "vendedor_id",         type: "key",      example: "VND-003" },
  { name: "vendedor_nome",       type: "text",     example: "João Silva" },
  { name: "pessoa_cidade",       type: "text_opt", example: "São Paulo" },
  { name: "empresa_id",          type: "key",      example: "1 / 2" },
];

const PAYABLE_SCHEMA: SchemaCol[] = [
  { name: "moeda_id",              type: "currency", example: "1" },
  { name: "moeda_sigla",           type: "text",     example: "R$" },
  { name: "pessoa_fornecedor_id",  type: "key",      example: "FOR-001" },
  { name: "pessoa_nome",           type: "text",     example: "Fornecedor XYZ Ltda" },
  { name: "data_emissao",          type: "date_opt", example: "01/12/2024" },
  { name: "data_vencimento",       type: "date",     example: "31/12/2024" },
  { name: "pagar_documento",       type: "text_opt", example: "NF-00456" },
  { name: "tipolanzamiento",       type: "text",     example: "Nota Fiscal" },
  { name: "valor_documento",       type: "decimal",  example: "3500,00" },
  { name: "data_pagamento",        type: "date_opt", example: "28/12/2024" },
  { name: "empresa_id",            type: "key",      example: "1 / 2" },
];

const INVENTORY_SCHEMA: SchemaCol[] = [
  { name: "produto_id",            type: "key",      example: "PROD-042" },
  { name: "produto_descricao",     type: "text",     example: "Notebook Pro 15" },
  { name: "produto_fabricante",    type: "text",     example: "DL-1500X-BLK" },
  { name: "estoque_item",          type: "number",   example: "37" },
  { name: "valor_estoque",         type: "decimal",  example: "1850,00" },
  { name: "moeda_id",              type: "currency", example: "1" },
  { name: "moeda_sigla",           type: "text",     example: "R$" },
  { name: "empresa_id",            type: "key",      example: "1 / 2" },
];

const CAIXA_SCHEMA: SchemaCol[] = [
  { name: "caixa_data_emissao",      type: "date",     example: "25/12/2024" },
  { name: "centro_custo_id",         type: "key_opt",  example: "CC-01" },
  { name: "centro_custo_descricao",  type: "text_opt", example: "Administrativo" },
  { name: "plano_conta_id",          type: "key",      example: "42" },
  { name: "plano_conta_codigo",      type: "text",     example: "3.1.02" },
  { name: "plano_conta_descricao",   type: "text",     example: "Aluguel" },
  { name: "caixa_id",                type: "key",      example: "CX-01" },
  { name: "caixa_descricao",         type: "text",     example: "Conta Corrente BB" },
  { name: "caixa_valor_documento",   type: "decimal",  example: "-1500,00 / 5000,00" },
  { name: "moeda_id",                type: "currency", example: "1" },
  { name: "moeda_sigla",             type: "text",     example: "R$" },
  { name: "empresa_id",              type: "key",      example: "1 / 2" },
];

const ORCAMENTO_SCHEMA: SchemaCol[] = [
  { name: "orcamento_id",                type: "key",      example: "ORC-001" },
  { name: "orcamento_data",              type: "date",     example: "15/01/2024" },
  // A view bi_orcamentos exporta status_orcamento; orcamento_confirmado é a
  // alternativa aceita (uma das duas basta).
  { name: "status_orcamento",            type: "text",     example: "Confirmado / Pendente" },
  { name: "orcamento_confirmado",        type: "bool",     example: "true" },
  { name: "orcamento_data_confirmacao",  type: "date_opt", example: "20/01/2024" },
  { name: "cliente_id",                  type: "key",      example: "CLI-001" },
  { name: "cliente_nome",                type: "text",     example: "Empresa ABC Ltda" },
  { name: "vendedor_id",                 type: "key",      example: "VND-001" },
  { name: "vendedor_nome",               type: "text",     example: "João Silva" },
  { name: "empresa_id",                  type: "key",      example: "1 / 2" },
  { name: "moeda_id",                    type: "currency", example: "1" },
  { name: "moeda_sigla",                 type: "text",     example: "R$" },
  { name: "item_orcamento_id",           type: "key",      example: "ITEM-001" },
  { name: "produto_id",                  type: "key",      example: "PROD-042" },
  { name: "produto_descricao",           type: "text",     example: "Notebook Pro 15" },
  { name: "produto_fabricante",          type: "text_opt", example: "DL-1500X-BLK" },
  { name: "item_quantidade",             type: "number",   example: "5" },
  { name: "item_quantidade_confirmada",  type: "number",   example: "3" },
  { name: "item_total",                  type: "decimal",  example: "5000,00" },
];
