import { NextResponse } from "next/server";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { autenticaIngestao, ehFalha } from "@/lib/server/ingest/auth";
import { DATASETS, type NomeDataset } from "@/lib/server/ingest/contrato";
import { ehErro, interpretaPeriodo } from "@/lib/server/ingest/periodo";
import {
  MAX_LINHAS,
  conferePertinencia,
  substituiPeriodo,
} from "@/lib/server/ingest/substituir";
import { reconstroiCambioMensal, valida as validaCambio, type LinhaCambioMensal } from "@/lib/server/ingest/cambio-mensal";
import { upsertMeta } from "@/lib/server/dataset-storage";
import type { DatasetKind } from "@/lib/server/dataset-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Um mês de vendas gira em torno de 11 MB; o estoque inteiro, 25 MB.
export const maxDuration = 300;

interface Ctx {
  params: Promise<{ dataset: string }>;
}

/** Nome na API → kind usado pelo `dataset_meta`, que é herança da importação CSV. */
const KIND_DA_META: Record<NomeDataset, DatasetKind> = {
  vendas: "sales",
  compras: "compras",
  orcamentos: "orcamento",
  receber: "receivable",
  pagar: "payable",
  caixa: "caixa",
  estoque: "inventory",
  // Não é um kind da importação CSV — existe só para carimbar dataset_meta,
  // que é o que invalida os caches de análise quando a cotação muda.
  cambio: "cambio" as DatasetKind,
};

const corpoSchema = z.object({
  periodo: z.string().min(1).max(40),
  linhas: z.array(z.unknown()),
});

function erro(status: number, mensagem: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, erro: mensagem, ...extra }, { status });
}

/**
 * POST /api/ingest/<dataset>
 *
 * Uma operação só: substitui o período informado pelas linhas enviadas.
 * Reenviar o mesmo período leva ao mesmo resultado — a idempotência vem de
 * substituir o conjunto inteiro, que é a única semântica possível sem chave
 * única de linha.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { dataset } = await ctx.params;
  if (!Object.prototype.hasOwnProperty.call(DATASETS, dataset)) {
    return erro(404, `Dataset "${dataset}" não existe.`, {
      disponiveis: Object.keys(DATASETS),
    });
  }
  const nome = dataset as NomeDataset;
  const def = DATASETS[nome];

  const auth = await autenticaIngestao(req);
  if (ehFalha(auth)) return erro(auth.status, auth.erro);

  let corpo: z.infer<typeof corpoSchema>;
  try {
    corpo = corpoSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      return erro(400, `Corpo inválido: ${e.issues[0]?.message}. Esperado { periodo, linhas }.`);
    }
    // Corpo truncado por limite de tamanho chega aqui como erro de parse, e
    // dizer "JSON inválido" manda o cliente procurar defeito onde não há.
    const tamanho = Number(req.headers.get("content-length") ?? 0);
    if (tamanho > 9_000_000) {
      return erro(413, `Corpo de ${(tamanho / 1048576).toFixed(1)} MB não pôde ser lido.`, {
        sugestao:
          def.colunaData === null
            ? "Reduza o volume ou fale com o suporte para ajustar o limite do servidor."
            : 'Envie um período menor — ex.: "2026-07-01..2026-07-15".',
      });
    }
    return erro(400, "Corpo inválido: não é um JSON legível. Esperado { periodo, linhas }.");
  }

  const periodo = interpretaPeriodo(corpo.periodo);
  if (ehErro(periodo)) return erro(400, periodo.erro);

  if (def.colunaData === null && periodo.de !== null) {
    return erro(400, `"${nome}" não tem data: use periodo "tudo".`);
  }
  if (def.colunaData !== null && periodo.de === null) {
    return erro(400, `"${nome}" é uma série temporal: informe um mês ou intervalo, não "tudo".`);
  }

  if (corpo.linhas.length > MAX_LINHAS) {
    return erro(413, `Lote com ${corpo.linhas.length} linhas excede o limite de ${MAX_LINHAS}.`, {
      sugestao:
        def.colunaData === null
          ? "Este dataset precisa vir inteiro numa requisição. Fale com o suporte."
          : 'Divida o período — ex.: "2026-07-01..2026-07-15" e depois "2026-07-16..2026-07-31".',
    });
  }

  // Validação linha a linha. O primeiro erro interrompe e diz ONDE está: um
  // lote de 21 mil linhas com uma data inválida é impossível de achar sem isso.
  const validas: Record<string, unknown>[] = [];
  for (let i = 0; i < corpo.linhas.length; i++) {
    const r = def.schema.safeParse(corpo.linhas[i]);
    if (!r.success) {
      const issue = r.error.issues[0];
      return erro(422, `Linha ${i} inválida: campo "${issue?.path.join(".") || "?"}" — ${issue?.message}`, {
        linha: i,
        recebido: corpo.linhas[i],
      });
    }
    validas.push(r.data as Record<string, unknown>);
  }

  const fora = conferePertinencia(nome, periodo, validas);
  if (fora) {
    return erro(422, `Linha ${fora.indice} tem data ${fora.valor}, fora do período ${periodo.rotulo}.`, {
      dica: "Linhas fora do período seriam apagadas no próximo envio. Ajuste o recorte no agente.",
    });
  }

  // ── Câmbio: caminho próprio ────────────────────────────────────────────────
  // Não é "substitua o período": a tabela é reescrita inteira, derivando os
  // dois sentidos de cada par e preenchendo mês sem cotação com o mais próximo.
  // Isso exige o conjunto COMPLETO, que é justamente como o câmbio é enviado.
  if (nome === "cambio") {
    const { validas: cot, problemas } = validaCambio(validas as unknown as LinhaCambioMensal[]);
    if (problemas.length > 0 && problemas.length >= validas.length / 4) {
      return erro(422, `${problemas.length} de ${validas.length} cotações recusadas por ordem de grandeza.`, {
        dica: "Confira o sentido do par na view bi_cambio — ver o cabeçalho do arquivo.",
        exemplo: problemas[0]!.motivo,
      });
    }
    try {
      const cob = await reconstroiCambioMensal(auth.db, cot);
      await upsertMeta(auth.db, {
        kind: KIND_DA_META[nome],
        filename: `api:${periodo.rotulo}`,
        rowCount: cob.linhas,
        importedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        ok: true,
        dataset: nome,
        empresa: auth.empresaNome,
        periodo: periodo.rotulo,
        recebidas: validas.length,
        recusadas: problemas.length,
        linhas: cob.linhas,
        derivadas: cob.derivadas,
        meses: cob.meses,
        de: cob.de,
        ate: cob.ate,
        moedas: cob.moedas,
        ms: cob.ms,
      });
    } catch (e) {
      console.error("[ingest] cambio falhou:", e);
      return erro(500, "Falha ao reconstruir o câmbio. Nada foi alterado.");
    }
  }

  try {
    const r = await substituiPeriodo(auth.db, nome, periodo, validas);

    // Mantém `dataset_meta` coerente: as telas e a importação de CSV leem daí
    // para saber se há dados e de quando são. O câmbio entra aqui também
    // porque é o carimbo que invalida os caches de análise — e mudar a cotação
    // muda todo valor convertido na tela.
    await upsertMeta(auth.db, {
      kind: KIND_DA_META[nome],
      filename: `api:${periodo.rotulo}`,
      rowCount: await contaTotal(auth.db, nome),
      importedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      dataset: nome,
      empresa: auth.empresaNome,
      periodo: periodo.rotulo,
      removidas: r.removidas,
      inseridas: r.inseridas,
      ms: r.ms,
    });
  } catch (e) {
    console.error(`[ingest] ${nome} ${periodo.rotulo} falhou:`, e);
    return erro(500, "Falha ao gravar. Nada foi alterado — o período segue como estava.");
  }
}

async function contaTotal(db: PrismaClient, nome: NomeDataset): Promise<number> {
  const [r] = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM ${DATASETS[nome].tabela}`
  );
  return r?.n ?? 0;
}

/** GET — o agente conferir o que já existe antes de decidir o que mandar. */
export async function GET(req: Request, ctx: Ctx) {
  const { dataset } = await ctx.params;
  if (!Object.prototype.hasOwnProperty.call(DATASETS, dataset)) {
    return erro(404, `Dataset "${dataset}" não existe.`, {
      disponiveis: Object.keys(DATASETS),
    });
  }
  const nome = dataset as NomeDataset;
  const def = DATASETS[nome];

  const auth = await autenticaIngestao(req);
  if (ehFalha(auth)) return erro(auth.status, auth.erro);

  const total = await contaTotal(auth.db, nome);
  let porMes: { periodo: string; linhas: number }[] = [];
  if (def.colunaData) {
    porMes = (
      await auth.db.$queryRawUnsafe<{ periodo: string; linhas: number }[]>(
        `SELECT substring(${def.colunaData}, 1, 7) AS periodo, COUNT(*)::int AS linhas
         FROM ${def.tabela} WHERE ${def.colunaData} <> ''
         GROUP BY 1 ORDER BY 1 DESC LIMIT 60`
      )
    ).map((r) => ({ periodo: r.periodo, linhas: Number(r.linhas) }));
  }

  return NextResponse.json({
    ok: true,
    dataset: nome,
    empresa: auth.empresaNome,
    totalDeLinhas: total,
    ultimosMeses: porMes,
  });
}
