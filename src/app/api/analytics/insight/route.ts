import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant";
import { getInsightInput } from "@/lib/server/analytics/insight";
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
});

/** Insumos do "Insight do dia" da sidebar — ver `analytics/insight.ts`. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let filtros: Omit<AnalyticsFilters, "moedaPadrao">;
  try {
    filtros = filtrosSchema.parse(await req.json());
  } catch (err) {
    const detalhe = err instanceof z.ZodError ? err.issues[0]?.message : "corpo inválido";
    return NextResponse.json({ error: `Filtros inválidos: ${detalhe}` }, { status: 400 });
  }

  if (filtros.from > filtros.to) {
    return NextResponse.json({ error: "Período invertido: 'from' é maior que 'to'" }, { status: 400 });
  }

  const { db, moedaPadrao } = await getTenantContext(session);
  const dados = await getInsightInput(db, { ...filtros, moedaPadrao }, String(session.empresaId));

  return NextResponse.json(dados);
}
