"use client";

import * as React from "react";
import type { DatasetKind } from "@/lib/parsers/csv-parser";
import { invalidaOpcoesFiltro } from "./use-opcoes-filtro";

/**
 * Importação de arquivo — envio e acompanhamento (fase E).
 *
 * O navegador não lê mais o arquivo: ele **envia**. O parse, a validação e a
 * gravação acontecem no servidor, em streaming. Isto aqui só sobe os bytes e
 * pergunta como vai indo.
 *
 * O envio é o arquivo cru no corpo, não `multipart/form-data`: o servidor
 * precisa poder gravar em disco conforme recebe, e o `formData()` do Next
 * carregaria os 245 MB na memória antes de entregar.
 */

export type StatusJob = "recebido" | "processando" | "concluido" | "erro";

export interface EstadoJob {
  id: string;
  kind: DatasetKind | null;
  filename: string;
  bytes: number;
  status: StatusJob;
  lidas: number;
  gravadas: number;
  ignoradas: number;
  erro: string;
  avisos: string[];
}

export interface ResumoDataset {
  kind: DatasetKind;
  present: boolean;
  filename?: string;
  rowCount?: number;
  importedAt?: string;
}

const INTERVALO_MS = 800;

/** Sobe o arquivo e devolve o id do job. */
export async function enviaArquivo(file: File): Promise<string> {
  const res = await fetch(`/api/importacao?filename=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Falha no envio (${res.status})`);
  return json.id as string;
}

export async function buscaJob(id: string): Promise<EstadoJob> {
  const res = await fetch(`/api/importacao/${id}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Falha ao consultar (${res.status})`);
  return json as EstadoJob;
}

/**
 * Acompanha o job até terminar.
 *
 * Fechar a aba no meio **não interrompe a importação** — o servidor continua.
 * Só se perde o acompanhamento, e o job segue consultável pelo id.
 */
export async function acompanhaJob(
  id: string,
  aoProgresso: (e: EstadoJob) => void
): Promise<EstadoJob> {
  for (;;) {
    const e = await buscaJob(id);
    aoProgresso(e);
    if (e.status === "concluido" || e.status === "erro") return e;
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
}

/** Metadados do que já está importado. Vem de `dataset_meta`, não do store. */
export function useDatasets(): {
  datasets: ResumoDataset[];
  recarrega: () => void;
  carregando: boolean;
} {
  const [datasets, setDatasets] = React.useState<ResumoDataset[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [gatilho, setGatilho] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch("/api/datasets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { datasets: [] }))
      .then((j) => {
        if (vivo) setDatasets((j.datasets ?? []) as ResumoDataset[]);
      })
      .catch(() => {
        if (vivo) setDatasets([]);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [gatilho]);

  const recarrega = React.useCallback(() => {
    // As listas de canal/vendedor/subgrupo mudam junto com os dados.
    invalidaOpcoesFiltro();
    setGatilho((g) => g + 1);
  }, []);

  return { datasets, recarrega, carregando };
}

export async function apagaDataset(kind: DatasetKind): Promise<void> {
  const res = await fetch(`/api/datasets/${kind}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Falha ao apagar (${res.status})`);
  invalidaOpcoesFiltro();
}
