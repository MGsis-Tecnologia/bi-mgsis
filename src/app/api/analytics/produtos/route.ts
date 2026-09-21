import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant";
import { getProdutosData, getProdutosPagina } from "@/lib/server/analytics/produtos";
import type { AnalyticsFilters } from "@/lib/server/analytics/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD");

const filtrosSchema = z.object({
  from: dataISO,
  to: dataISO,
  cmpFrom: dataISO.nullable().default(null),
  cmpTo: dataISO.nullable().default(null),
  currency: z.enum(["ALL", "1", "2", "3"]).default("ALL"),
  empresaId: z.string().default("all"),
  channel: z.string().default("all"),
  sellerId: z.string().default("all"),
  subgroupId: z.string().default("all"),
  // Presente = pede UMA PÁGINA de uma das tabelas grandes, em vez da tela inteira.
  tabela: z.enum(["abc", "lucro"]).optional(),
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limite: z.number().int().min(1).max(100).default(50),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let filtros: Omit<AnalyticsFilters, "moedaPadrao">;
  let pagina: { tabela: "abc" | "lucro"; offset: number; limite: number } | null;
  try {
    const { tabela, offset, limite, ...resto } = filtrosSchema.parse(await req.json());
    filtros = resto;
    pagina = tabela ? { tabela, offset, limite } : null;
  } catch (err) {
    const detalhe = err instanceof z.ZodError ? err.issues[0]?.message : "corpo inválido";
    return NextResponse.json({ error: `Filtros inválidos: ${detalhe}` }, { status: 400 });
  }

  if (filtros.from > filtros.to) {
    return NextResponse.json({ error: "Período invertido: 'from' é maior que 'to'" }, { status: 400 });
  }

  const { db, moedaPadrao } = await getTenantContext(session);
  const inicio = Date.now();

  if (pagina) {
    const r = await getProdutosPagina(db, { ...filtros, moedaPadrao }, pagina.tabela, pagina.offset, pagina.limite);
    return NextResponse.json({ ...r, ms: Date.now() - inicio });
  }

  const data = await getProdutosData(db, { ...filtros, moedaPadrao });

  return NextResponse.json({ ...data, ms: Date.now() - inicio });
}
