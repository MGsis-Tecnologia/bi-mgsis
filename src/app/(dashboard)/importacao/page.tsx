"use client";

import * as React from "react";
import { CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface UploadItem {
  id: string;
  name: string;
  size: number;
  status: "queued" | "processing" | "ok" | "error";
  rows?: number;
  errors?: number;
}

const SUPPORTED = ["xlsx", "xls", "csv"];

const COLUMN_SCHEMA = [
  { src: "Nº pedido", dest: "Order.number", required: true },
  { src: "Data", dest: "Order.date", required: true, format: "DD/MM/YYYY" },
  { src: "Cliente", dest: "Customer.name", required: true },
  { src: "CPF/CNPJ", dest: "Customer.document" },
  { src: "Vendedor", dest: "Seller.code" },
  { src: "Canal", dest: "Order.channel" },
  { src: "Região", dest: "Order.region" },
  { src: "SKU", dest: "Item.sku", required: true },
  { src: "Quantidade", dest: "Item.quantity", required: true },
  { src: "Preço unitário", dest: "Item.unitPrice", required: true },
  { src: "Desconto %", dest: "Item.discountPct" },
  { src: "Custo unitário", dest: "Item.unitCost" },
  { src: "Frete", dest: "Order.shipping" },
  { src: "Status", dest: "Order.status" },
];

export default function ImportacaoPage() {
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);

  const onDrop = (files: FileList | null) => {
    if (!files) return;
    const newItems: UploadItem[] = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      status: "queued",
    }));
    setItems((prev) => [...newItems, ...prev]);
    // Simulate processing
    newItems.forEach((item, idx) => {
      setTimeout(() => {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "processing" } : i))
        );
        setTimeout(() => {
          const ext = item.name.split(".").pop()?.toLowerCase();
          const valid = !!ext && SUPPORTED.includes(ext);
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: valid ? "ok" : "error",
                    rows: valid ? Math.floor(800 + Math.random() * 4400) : undefined,
                    errors: valid ? Math.floor(Math.random() * 12) : undefined,
                  }
                : i
            )
          );
        }, 900 + idx * 350);
      }, 250);
    });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operação · ingestão"
        title="Importação de dados."
        description="Suba planilhas para alimentar o dashboard. Suportamos XLSX, XLS e CSV. Schema validado automaticamente."
      >
        <Badge variant="ghost" className="gap-1">
          <FileSpreadsheet className="h-3 w-3" />
          {SUPPORTED.join(" · ").toUpperCase()}
        </Badge>
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              onDrop(e.dataTransfer.files);
            }}
            className={cn(
              "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 px-6 transition-colors cursor-pointer pinstripe",
              isDragging
                ? "border-accent bg-accent/5"
                : "border-border hover:border-foreground/30 hover:bg-muted/30"
            )}
          >
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => onDrop(e.target.files)}
            />
            <div className="grid h-12 w-12 place-items-center rounded-full bg-surface border border-border">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <div className="font-medium">Arraste planilhas aqui ou clique para selecionar</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Tamanho máximo 25MB · múltiplos arquivos suportados
              </div>
            </div>
          </label>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Histórico de uploads</CardTitle>
              <Badge variant="ghost">{items.length} arquivo(s)</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nenhum arquivo importado ainda.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {items.map((i) => (
                  <div key={i.id} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 py-3">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">{i.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular">
                        {(i.size / 1024).toFixed(1)} KB
                        {i.rows !== undefined && ` · ${i.rows.toLocaleString("pt-BR")} linhas`}
                        {i.errors !== undefined && i.errors > 0 && ` · ${i.errors} avisos`}
                      </div>
                    </div>
                    <StatusBadge status={i.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schema esperado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {COLUMN_SCHEMA.slice(0, 8).map((c) => (
              <div
                key={c.src}
                className="flex items-start justify-between gap-2 text-xs py-1.5 border-b border-border last:border-0"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.src}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{c.dest}</div>
                </div>
                {c.required && (
                  <Badge variant="warning" className="shrink-0 text-[9px]">
                    obrigatório
                  </Badge>
                )}
              </div>
            ))}
            <div className="pt-2 text-[10px] text-muted-foreground">
              +{COLUMN_SCHEMA.length - 8} colunas mapeadas opcionalmente. Tipos inferidos por valor.
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline de ingestão</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {["Upload", "Parser", "Validação", "Persistência"].map((step, i) => (
            <div key={step} className="rounded-md border border-border bg-surface-sunken p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-foreground text-background text-[10px] font-mono">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{step}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {[
                  "Recepção do arquivo, verificação de integridade e tipo MIME.",
                  "Detecção automática de delimitadores, encoding e cabeçalho.",
                  "Schema, tipos, regras de negócio e duplicatas.",
                  "Persistência transacional com rollback em caso de erro.",
                ][i]}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: UploadItem["status"] }) {
  switch (status) {
    case "queued":
      return <Badge variant="ghost">Em fila</Badge>;
    case "processing":
      return (
        <Badge variant="accent" className="gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
          Processando
        </Badge>
      );
    case "ok":
      return (
        <Badge variant="positive" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> Importado
        </Badge>
      );
    case "error":
      return (
        <Badge variant="negative" className="gap-1">
          <X className="h-3 w-3" /> Falhou
        </Badge>
      );
  }
}
