"use client";

import * as React from "react";
import { Boxes, CheckCircle2, CircleDollarSign, Clock, CreditCard, Landmark, Loader2, ShoppingCart, Trash2, Upload, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseFile, type DatasetKind } from "@/lib/parsers/csv-parser";
import { useDatasetStore, IDB_KEY, RECEIVABLES_IDB_KEY, PAYABLES_IDB_KEY, INVENTORY_IDB_KEY, CAIXA_IDB_KEY } from "@/lib/store/dataset";
import { idbSet, idbDel } from "@/lib/store/idb";
import { useTranslation } from "@/lib/hooks/use-translation";
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

const KIND_LABEL: Record<string, string> = {
  sales: "Vendas",
  receivable: "Contas a Receber",
  payable: "Contas a Pagar",
  inventory: "Estoque",
  caixa: "Caixa / Banco",
};

export default function ImportacaoPage() {
  const { t } = useTranslation();
  const [drag, setDrag] = React.useState(false);
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const queueRef = React.useRef<QueueItem[]>([]);
  const processingRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const {
    dataset, receivables, payables, inventory, caixa,
    setDataset, setReceivables, setPayables, setInventory, setCaixa,
    clearDataset, clearReceivables, clearPayables, clearInventory, clearCaixa,
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

      if (result.errors.length > 0 || (!result.dataset && !result.receivables && !result.payables && !result.inventory && !result.caixa)) {
        updateItem(nextItem.id, {
          status: "error", kind: result.kind,
          errors: result.errors, warnings: result.warnings, skipped: result.skipped,
        });
        continue;
      }

      if (result.kind === "caixa" && result.caixa) {
        await idbSet(CAIXA_IDB_KEY, result.caixa);
        setCaixa(result.caixa);
        updateItem(nextItem.id, {
          status: "success", kind: "caixa",
          rowCount: result.caixa.rowCount, warnings: result.warnings, skipped: result.skipped,
        });
      } else if (result.kind === "inventory" && result.inventory) {
        await idbSet(INVENTORY_IDB_KEY, result.inventory);
        setInventory(result.inventory);
        updateItem(nextItem.id, {
          status: "success", kind: "inventory",
          rowCount: result.inventory.rowCount, warnings: result.warnings, skipped: result.skipped,
        });
      } else if (result.kind === "payable" && result.payables) {
        await idbSet(PAYABLES_IDB_KEY, result.payables);
        setPayables(result.payables);
        updateItem(nextItem.id, {
          status: "success", kind: "payable",
          rowCount: result.payables.rowCount, warnings: result.warnings, skipped: result.skipped,
        });
      } else if (result.kind === "receivable" && result.receivables) {
        await idbSet(RECEIVABLES_IDB_KEY, result.receivables);
        setReceivables(result.receivables);
        updateItem(nextItem.id, {
          status: "success", kind: "receivable",
          rowCount: result.receivables.rowCount, warnings: result.warnings, skipped: result.skipped,
        });
      } else if (result.dataset) {
        await idbSet(IDB_KEY, result.dataset);
        setDataset(result.dataset);
        updateItem(nextItem.id, {
          status: "success", kind: "sales",
          rowCount: result.dataset.rowCount, warnings: result.warnings, skipped: result.skipped,
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
  const hasDatasets = !!(dataset || receivables || payables || inventory || caixa);

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
              <p className="mt-1 text-[11px] text-muted-foreground">
                Vendas, Contas a Receber, Contas a Pagar, Estoque e Caixa/Banco — o tipo é identificado automaticamente pelas colunas.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Selecione vários arquivos de uma vez para importar em fila.
              </p>
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
              Fila de importação
              {isRunning && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {queue.filter(i => i.status === "success").length}/{queue.length} concluídos
                </span>
              )}
            </CardTitle>
            {!isRunning && (
              <button
                onClick={() => { queueRef.current = []; setQueue([]); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpar
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
          <CardHeader><CardTitle>Dados importados</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {dataset && (
              <DatasetRow
                icon={<ShoppingCart className="h-4 w-4 text-accent" />}
                title="Vendas"
                filename={dataset.filename}
                rowLabel={`${formatNumber(dataset.rowCount)} linhas`}
                importedAt={dataset.importedAt}
                onRemove={() => { idbDel(IDB_KEY); clearDataset(); }}
              />
            )}
            {receivables && (
              <DatasetRow
                icon={<CircleDollarSign className="h-4 w-4 text-accent" />}
                title="Contas a Receber"
                filename={receivables.filename}
                rowLabel={`${formatNumber(receivables.rowCount)} títulos`}
                importedAt={receivables.importedAt}
                onRemove={() => { idbDel(RECEIVABLES_IDB_KEY); clearReceivables(); }}
              />
            )}
            {payables && (
              <DatasetRow
                icon={<CreditCard className="h-4 w-4 text-accent" />}
                title="Contas a Pagar"
                filename={payables.filename}
                rowLabel={`${formatNumber(payables.rowCount)} títulos`}
                importedAt={payables.importedAt}
                onRemove={() => { idbDel(PAYABLES_IDB_KEY); clearPayables(); }}
              />
            )}
            {inventory && (
              <DatasetRow
                icon={<Boxes className="h-4 w-4 text-accent" />}
                title="Estoque"
                filename={inventory.filename}
                rowLabel={`${formatNumber(inventory.rowCount)} SKUs`}
                importedAt={inventory.importedAt}
                onRemove={() => { idbDel(INVENTORY_IDB_KEY); clearInventory(); }}
              />
            )}
            {caixa && (
              <DatasetRow
                icon={<Landmark className="h-4 w-4 text-accent" />}
                title="Caixa / Banco"
                filename={caixa.filename}
                rowLabel={`${formatNumber(caixa.rowCount)} movimentações`}
                importedAt={caixa.importedAt}
                onRemove={() => { idbDel(CAIXA_IDB_KEY); clearCaixa(); }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Schema reference */}
      <Card>
        <CardHeader><CardTitle>{t("importacao.schema.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <SchemaTable
            heading="Leiaute · Vendas"
            note="Datas: DD/MM/AAAA · Decimais: vírgula (padrão BR) · moeda_id: 1=R$ 2=US$ 3=G$ · importa linhas com pedido_tipo = VENDA."
            cols={SALES_SCHEMA}
          />
          <SchemaTable
            heading="Leiaute · Contas a Receber"
            note="Cada linha é um título. data_recebimento preenchida = título recebido; vazia = pendente. pessoa_cidade é opcional."
            cols={RECEIVABLE_SCHEMA}
          />
          <SchemaTable
            heading="Leiaute · Contas a Pagar"
            note="Cada linha é uma obrigação de pagamento. data_pagamento preenchida = pago; vazia = pendente."
            cols={PAYABLE_SCHEMA}
          />
          <SchemaTable
            heading="Leiaute · Estoque"
            note="Snapshot do inventário (uma linha por SKU). produto_id liga ao item de venda. valor_estoque é o custo total do estoque em US$."
            cols={INVENTORY_SCHEMA}
          />
          <SchemaTable
            heading="Leiaute · Caixa / Banco"
            note="Cada linha é uma movimentação. caixa_valor_documento negativo = saída (despesa); positivo = entrada (ingresso). Suporta hierarquia de plano de contas pelo campo plano_conta_codigo (ex: 1.1.01)."
            cols={CAIXA_SCHEMA}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
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
            <span className="text-[11px] text-muted-foreground">Na fila…</span>
          )}
          {item.status === "parsing" && (
            <span className="text-[11px] text-accent animate-pulse">Processando…</span>
          )}
          {item.status === "success" && item.kind && (
            <>
              <Badge variant="ghost">{KIND_LABEL[item.kind]}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {formatNumber(item.rowCount)} {item.kind === "sales" ? "linha(s)" : item.kind === "inventory" ? "SKU(s)" : item.kind === "caixa" ? "movimentação(ões)" : "título(s)"}
              </span>
              {item.skipped > 0 && (
                <span className="text-[11px] text-muted-foreground">{item.skipped} ignorada(s)</span>
              )}
            </>
          )}
          {item.status === "error" && (
            <span className="text-[11px] text-negative">{item.errors[0] ?? "Erro ao processar"}</span>
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
  icon, title, filename, rowLabel, importedAt, onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  filename: string;
  rowLabel: string;
  importedAt: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{title}</span>
            <Badge variant="positive" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />Ativo
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            <span className="font-mono">{filename}</span> · {rowLabel} · {formatDate(new Date(importedAt), "long")}
          </div>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-negative hover:border-negative transition-colors shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" /> Remover
      </button>
    </div>
  );
}

function SchemaTable({
  heading, note, cols,
}: {
  heading: string;
  note: string;
  cols: { name: string; type: string; example: string }[];
}) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground mb-2">{heading}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-6 font-medium text-muted-foreground uppercase tracking-wide">Coluna</th>
              <th className="pb-2 pr-6 font-medium text-muted-foreground uppercase tracking-wide">Tipo</th>
              <th className="pb-2 font-medium text-muted-foreground uppercase tracking-wide">Exemplo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {cols.map((col) => (
              <tr key={col.name}>
                <td className="py-2 pr-6 font-mono text-foreground">{col.name}</td>
                <td className="py-2 pr-6 text-muted-foreground">{col.type}</td>
                <td className="py-2 text-muted-foreground">{col.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

const SALES_SCHEMA = [
  { name: "pedido_data",         type: "Data",    example: "25/12/2024" },
  { name: "pedido_documento",    type: "Chave",   example: "PED-00123" },
  { name: "pedido_canal",        type: "Texto",   example: "Atacado / Varejo" },
  { name: "cliente_id",          type: "Chave",   example: "CLI-001" },
  { name: "cliente_nome",        type: "Texto",   example: "Empresa ABC Ltda" },
  { name: "produto_id",          type: "Chave",   example: "PROD-042" },
  { name: "produto_descricao",   type: "Texto",   example: "Notebook Pro 15" },
  { name: "produto_quantidade",  type: "Número",  example: "2" },
  { name: "produto_valor_total", type: "Decimal", example: "1250,00" },
  { name: "produto_valor_custo", type: "Decimal", example: "900,00" },
  { name: "subgrupo_id",         type: "Chave",   example: "SG-05" },
  { name: "subgrupo_descricao",  type: "Texto",   example: "Informática" },
  { name: "vendedor_id",         type: "Chave",   example: "VND-003" },
  { name: "vendedor_nome",       type: "Texto",   example: "João Silva" },
  { name: "moeda_id",            type: "1|2|3",   example: "1" },
  { name: "moeda_sigla",         type: "Texto",   example: "R$" },
  { name: "pedido_tipo",         type: "Texto",   example: "VENDA" },
];

const RECEIVABLE_SCHEMA = [
  { name: "moeda_id",            type: "1|2|3",          example: "1" },
  { name: "moeda_sigla",         type: "Texto",          example: "R$" },
  { name: "pessoa_cliente_id",   type: "Chave",          example: "CLI-001" },
  { name: "pessoa_nome",         type: "Texto",          example: "Empresa ABC Ltda" },
  { name: "data_emissao",        type: "Data",           example: "25/12/2024" },
  { name: "data_vencimento",     type: "Data",           example: "25/01/2025" },
  { name: "receber_documento",   type: "Texto (opcional)", example: "DUP-00123" },
  { name: "tipolanzamiento",     type: "Texto",          example: "Duplicata" },
  { name: "valor_documento",     type: "Decimal",        example: "1250,00" },
  { name: "data_recebimento",    type: "Data (opcional)", example: "20/01/2025" },
  { name: "vendedor_id",         type: "Chave",          example: "VND-003" },
  { name: "vendedor_nome",       type: "Texto",          example: "João Silva" },
  { name: "pessoa_cidade",       type: "Texto (opcional)", example: "São Paulo" },
];

const PAYABLE_SCHEMA = [
  { name: "moeda_id",              type: "1|2|3",          example: "1" },
  { name: "moeda_sigla",           type: "Texto",          example: "R$" },
  { name: "pessoa_fornecedor_id",  type: "Chave",          example: "FOR-001" },
  { name: "pessoa_nome",           type: "Texto",          example: "Fornecedor XYZ Ltda" },
  { name: "data_emissao",          type: "Data (opcional)", example: "01/12/2024" },
  { name: "data_vencimento",       type: "Data",           example: "31/12/2024" },
  { name: "pagar_documento",       type: "Texto (opcional)", example: "NF-00456" },
  { name: "tipolanzamiento",       type: "Texto",          example: "Nota Fiscal" },
  { name: "valor_documento",       type: "Decimal",        example: "3500,00" },
  { name: "data_pagamento",        type: "Data (opcional)", example: "28/12/2024" },
];

const INVENTORY_SCHEMA = [
  { name: "produto_id",            type: "Chave",   example: "PROD-042" },
  { name: "produto_descricao",     type: "Texto",   example: "Notebook Pro 15" },
  { name: "produto_fabricante",    type: "Texto",   example: "DL-1500X-BLK" },
  { name: "estoque_item",          type: "Número",  example: "37" },
  { name: "valor_estoque",         type: "Decimal · US$", example: "1850,00" },
];

const CAIXA_SCHEMA = [
  { name: "caixa_data_emissao",      type: "Data",            example: "25/12/2024" },
  { name: "centro_custo_id",         type: "Chave (opcional)", example: "CC-01" },
  { name: "centro_custo_descricao",  type: "Texto (opcional)", example: "Administrativo" },
  { name: "plano_conta_id",          type: "Chave",            example: "42" },
  { name: "plano_conta_codigo",      type: "Texto",            example: "3.1.02" },
  { name: "plano_conta_descricao",   type: "Texto",            example: "Aluguel" },
  { name: "caixa_id",               type: "Chave",            example: "CX-01" },
  { name: "caixa_descricao",        type: "Texto",            example: "Conta Corrente BB" },
  { name: "caixa_valor_documento",  type: "Decimal",          example: "-1500,00 / 5000,00" },
  { name: "moeda_id",               type: "1|2|3",            example: "1" },
  { name: "moeda_sigla",            type: "Texto",            example: "R$" },
];
