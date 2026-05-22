"use client";

import * as React from "react";
import { CheckCircle2, CircleDollarSign, ShoppingCart, Trash2, Upload, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseFile, type DatasetKind } from "@/lib/parsers/csv-parser";
import { useDatasetStore, IDB_KEY, RECEIVABLES_IDB_KEY } from "@/lib/store/dataset";
import { idbSet, idbDel } from "@/lib/store/idb";
import { useTranslation } from "@/lib/hooks/use-translation";
import { formatNumber, formatDate } from "@/lib/utils/format";

type Status = "idle" | "parsing" | "success" | "error";

interface ParseState {
  status: Status;
  kind: DatasetKind | null;
  errors: string[];
  warnings: string[];
  skipped: number;
  rowCount: number;
  filename: string;
}

const IDLE: ParseState = {
  status: "idle", kind: null, errors: [], warnings: [], skipped: 0, rowCount: 0, filename: "",
};

export default function ImportacaoPage() {
  const { t } = useTranslation();
  const [drag, setDrag] = React.useState(false);
  const [state, setState] = React.useState<ParseState>(IDLE);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { dataset, receivables, setDataset, setReceivables, clearDataset, clearReceivables } =
    useDatasetStore();

  async function handleFile(file: File) {
    setState({ ...IDLE, status: "parsing", filename: file.name });
    const result = await parseFile(file);

    if (result.errors.length > 0 || (!result.dataset && !result.receivables)) {
      setState({
        status: "error", kind: result.kind, errors: result.errors,
        warnings: result.warnings, skipped: result.skipped, rowCount: 0, filename: file.name,
      });
      return;
    }

    if (result.kind === "receivable" && result.receivables) {
      await idbSet(RECEIVABLES_IDB_KEY, result.receivables);
      setReceivables(result.receivables);
      setState({
        status: "success", kind: "receivable", errors: [], warnings: result.warnings,
        skipped: result.skipped, rowCount: result.receivables.rowCount, filename: file.name,
      });
    } else if (result.dataset) {
      await idbSet(IDB_KEY, result.dataset);
      setDataset(result.dataset);
      setState({
        status: "success", kind: "sales", errors: [], warnings: result.warnings,
        skipped: result.skipped, rowCount: result.dataset.rowCount, filename: file.name,
      });
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

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
              <Upload className={`h-5 w-5 ${state.status === "parsing" ? "animate-pulse text-accent" : "text-muted-foreground"}`} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{t("importacao.upload.title")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("importacao.upload.desc")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Vendas e Contas a Receber — o tipo é identificado automaticamente pelas colunas.
              </p>
            </div>
            {state.status === "parsing" && (
              <p className="text-xs text-accent animate-pulse">Processando {state.filename}…</p>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onInputChange} />
        </CardContent>
      </Card>

      {/* Result feedback */}
      {state.status === "success" && (
        <div className="flex items-start gap-3 rounded-lg border border-positive/30 bg-positive/5 p-4">
          <CheckCircle2 className="h-4 w-4 text-positive mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground flex flex-wrap items-center gap-2">
              {formatNumber(state.rowCount)} {state.kind === "receivable" ? "título(s)" : "linha(s)"} de{" "}
              <span className="font-mono text-xs">{state.filename}</span>
              <Badge variant="ghost">
                {state.kind === "receivable" ? "Contas a Receber" : "Vendas"}
              </Badge>
            </p>
            {state.skipped > 0 && (
              <p className="text-xs text-muted-foreground">
                {state.skipped} linha(s) ignorada(s)
                {state.kind === "receivable"
                  ? " (campos chave vazios, vencimento ou valor inválido)."
                  : " (pedido_tipo ≠ VENDAS ou campos inválidos)."}
              </p>
            )}
            {state.warnings.map((w, i) => (
              <p key={i} className="text-xs text-warning">{w}</p>
            ))}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-negative/30 bg-negative/5 p-4">
          <XCircle className="h-4 w-4 text-negative mt-0.5 shrink-0" />
          <div className="space-y-1">
            {state.errors.map((e, i) => (
              <p key={i} className="text-sm text-foreground">{e}</p>
            ))}
            {state.warnings.map((w, i) => (
              <p key={i} className="text-xs text-muted-foreground">{w}</p>
            ))}
          </div>
        </div>
      )}

      {/* Current datasets */}
      {(dataset || receivables) && (
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
                onRemove={() => {
                  idbDel(IDB_KEY); clearDataset();
                  setState((s) => (s.kind === "sales" ? IDLE : s));
                }}
              />
            )}
            {receivables && (
              <DatasetRow
                icon={<CircleDollarSign className="h-4 w-4 text-accent" />}
                title="Contas a Receber"
                filename={receivables.filename}
                rowLabel={`${formatNumber(receivables.rowCount)} títulos`}
                importedAt={receivables.importedAt}
                onRemove={() => {
                  idbDel(RECEIVABLES_IDB_KEY); clearReceivables();
                  setState((s) => (s.kind === "receivable" ? IDLE : s));
                }}
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
            note="Datas: DD/MM/AAAA · Decimais: vírgula (padrão BR) · moeda_id: 1=R$ 2=US$ 3=G$ · importa linhas com pedido_tipo = VENDAS."
            cols={SALES_SCHEMA}
          />
          <SchemaTable
            heading="Leiaute · Contas a Receber"
            note="Cada linha é um título em aberto. Atraso calculado por data_vencimento vs. hoje. pessoa_cidade é opcional."
            cols={RECEIVABLE_SCHEMA}
          />
        </CardContent>
      </Card>
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
  { name: "pedido_tipo",         type: "Texto",   example: "VENDAS" },
];

const RECEIVABLE_SCHEMA = [
  { name: "moeda_id",          type: "1|2|3",          example: "1" },
  { name: "moeda_sigla",       type: "Texto",          example: "R$" },
  { name: "pessoa_cliente_id", type: "Chave",          example: "CLI-001" },
  { name: "pessoa_nome",       type: "Texto",          example: "Empresa ABC Ltda" },
  { name: "data_emissao",      type: "Data",           example: "25/12/2024" },
  { name: "data_vencimento",   type: "Data",           example: "25/01/2025" },
  { name: "receber_documento", type: "Chave",          example: "DUP-00123" },
  { name: "tipolanzamiento",   type: "Texto",          example: "Duplicata" },
  { name: "valor_documento",   type: "Decimal",        example: "1250,00" },
  { name: "vendedor_id",       type: "Chave",          example: "VND-003" },
  { name: "vendedor_nome",     type: "Texto",          example: "João Silva" },
  { name: "pessoa_cidade",     type: "Texto (opcional)", example: "São Paulo" },
];
