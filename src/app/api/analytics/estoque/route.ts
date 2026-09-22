import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant";
import {
  MAX_LINHAS_MOVIMENTO,
  MAX_LINHAS_MOVIMENTO_EXCEL,
  getEstoqueData,
  getMovimentoDoSku,
} from "@/lib/server/analytics/estoque";
import type { AnalyticsFilters } from "@/lib/server/analytics/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD");

const corpoSchema = z.object({
  from: dataISO,
  to: dataISO,
  currency: z.enum(["ALL", "1", "2", "3"]).default("ALL"),
  empresaId: z.string().default("all"),
  channel: z.string().default("all"),
  sellerId: z.string().default("all"),
  subgroupId: z.string().default("all"),
  hoje: dataISO,
  status: z
    .enum(["all", "rupture", "risk", "normal", "excess", "no_movement"])
    .default("all"),
  coverageBucket: z
    .enum(["all", "sem_cobertura", "fora_analise", "ate_1", "1_2", "2_4", "4_6", "6_12", "mais_12"])
    .default("all"),
  lastPurchaseBucket: z
    .enum(["all", "sem_compra", "ate_1", "1_2", "2_4", "4_6", "6_12", "mais_12"])
    .default("all"),
  fornecedorId: z.string().max(255).default("all"),
  busca: z.string().max(120).default(""),
  // Extrato de um SKU (o painel que abre ao clicar numa linha da tabela). Quando
  // vem, a rota responde SÓ o extrato — a tela já tem o resto na mão, e refazer
  // a agregação inteira a cada clique seria o caro desta tela.
  detalhe: z.literal("sku").optional(),
  skuId: z.string().max(255).default(""),
  escopoDetalhe: z.enum(["periodo", "tudo"]).default("periodo"),
  limiteDetalhe: z.number().int().min(1).max(MAX_LINHAS_MOVIMENTO_EXCEL).default(MAX_LINHAS_MOVIMENTO),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let corpo: z.infer<typeof corpoSchema>;
  try {
    corpo = corpoSchema.parse(await req.json());
  } catch (err) {
    const detalhe = err instanceof z.ZodError ? err.issues[0]?.message : "corpo inválido";
    return NextResponse.json({ error: `Filtros inválidos: ${detalhe}` }, { status: 400 });
  }

  if (corpo.from > corpo.to) {
    return NextResponse.json({ error: "Período invertido: 'from' é maior que 'to'" }, { status: 400 });
  }

  const { db, moedaPadrao } = await getTenantContext(session);

  const filtros: AnalyticsFilters = {
    from: corpo.from,
    to: corpo.to,
    cmpFrom: null,
    cmpTo: null,
    currency: corpo.currency,
    moedaPadrao,
    empresaId: corpo.empresaId,
    channel: corpo.channel,
    sellerId: corpo.sellerId,
    subgroupId: corpo.subgroupId,
  };

  const inicio = Date.now();

  if (corpo.detalhe === "sku") {
    if (!corpo.skuId) {
      return NextResponse.json({ error: "Detalhe do SKU exige 'skuId'" }, { status: 400 });
    }
    const movimento = await getMovimentoDoSku(db, filtros, corpo.skuId, {
      escopo: corpo.escopoDetalhe,
      limite: corpo.limiteDetalhe,
    });
    return NextResponse.json({ ...movimento, ms: Date.now() - inicio });
  }

  const data = await getEstoqueData(db, filtros, {
    hoje: corpo.hoje,
    status: corpo.status,
    coverageBucket: corpo.coverageBucket,
    lastPurchaseBucket: corpo.lastPurchaseBucket,
    fornecedorId: corpo.fornecedorId,
    busca: corpo.busca,
  });

  return NextResponse.json({ ...data, ms: Date.now() - inicio });
}
