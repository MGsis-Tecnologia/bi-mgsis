"use client";

import * as React from "react";
import { CheckCircle2, Trash2, Upload, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseFile } from "@/lib/parsers/csv-parser";
import { useDatasetStore } from "@/lib/store/dataset";
import { useTranslation } from "@/lib/hooks/use-translation";
import { formatNumber, formatDate } from "@/lib/utils/format";

type Status = "idle" | "parsing" | "success" | "error";

interface ParseState {
  status: Status;
  errors: string[];
  warnings: string[];
  skipped: number;
  rowCount: number;
  filename: string;
}

const REQUIRED_COLS = [
  "pedido_data", "pedido_documento", "pedido_canal",
  "cliente_id", "cliente_nome",
  "produto_id", "produto_descricao", "produto_quantidade",
  "produto_valor_total", "produto_valor_custo",
  "subgrupo_id", "subgrupo_descricao",
  "vendedor_id", "vendedor_nome",
  "moeda_id", "moeda_sigla", "pedido_tipo",
];

export default function ImportacaoPage() {
  const { t } = useTranslation();
  const [drag, setDrag] = React.useState(false);
  const [state, setState] = React.useState<ParseState>({
    status: "idle", errors: [], warnings: [], skipped: 0, rowCount: 0, filename: "",
  });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { dataset, setDataset, clearDataset } = useDatasetStore();

  async function handleFile(file: File) {
    setState({ status: "parsing", errors: [], warnings: [], skipped: 0, rowCount: 0, filename: file.name });
    const result = await parseFile(file);
    if (result.errors.length > 0 || !result.dataset) {
      setState({ status: "error", errors: result.errors, warnings: result.warnings, skipped: result.skipped, rowCount: 0, filename: file.name });
    } else {
      setDataset(result.dataset);
      setState({ status: "success", errors: [], warnings: result.warnings, skipped: result.skipped, rowCount: result.dataset.rowCount, filename: file.name });
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
            <p className="text-sm font-medium text-foreground">
              {formatNumber(state.rowCount)} linhas importadas de <span className="font-mono text-xs">{state.filename}</span>
            </p>
            {state.skipped > 0 && (
              <p className="text-xs text-muted-foreground">{state.skipped} linha(s) ignorada(s) (pedido_tipo ≠ VENDAS ou campos inválidos).</p>
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

      {/* Current dataset info */}
      {dataset && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Dataset atual</CardTitle>
              <button
                onClick={() => { clearDataset(); setState({ status: "idle", errors: [], warnings: [], skipped: 0, rowCount: 0, filename: "" }); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-negative hover:border-negative transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remover dados
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Arquivo" value={<span className="font-mono text-xs truncate">{dataset.filename}</span>} />
              <Stat label="Linhas" value={formatNumber(dataset.rowCount)} />
              <Stat label="Importado em" value={formatDate(new Date(dataset.importedAt), "long")} />
              <Stat label="Status" value={<Badge variant="positive" className="gap-1"><span className="h-1.5 w-1.5 rounded-full bg-positive" />Ativo</Badge>} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schema reference */}
      <Card>
        <CardHeader><CardTitle>{t("importacao.schema.title")}</CardTitle></CardHeader>
        <CardContent>
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
                {SCHEMA_COLS.map((col) => (
                  <tr key={col.name}>
                    <td className="py-2 pr-6 font-mono text-foreground">{col.name}</td>
                    <td className="py-2 pr-6 text-muted-foreground">{col.type}</td>
                    <td className="py-2 text-muted-foreground">{col.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Todas as {REQUIRED_COLS.length} colunas são obrigatórias · Datas: DD/MM/AAAA · Decimais: vírgula (padrão BR) · moeda_id: 1=R$ 2=US$ 3=G$
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

const SCHEMA_COLS = [
  { name: "pedido_data",         type: "Data",    example: "25/12/2024" },
  { name: "pedido_documento",    type: "Texto",   example: "PED-00123" },
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
