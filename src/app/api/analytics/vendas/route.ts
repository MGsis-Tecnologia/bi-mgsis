import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { getVendasData } from "@/lib/server/analytics/vendas";
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
  // Taxas ainda vêm do cliente para manter os números idênticos aos de hoje.
  // Quando a tabela `cambio` existir (fase D), a origem passa a ser o banco.
  rates: z.record(z.string(), z.number().positive()).default({}),
  empresaId: z.string().default("all"),
  channel: z.string().default("all"),
  sellerId: z.string().default("all"),
  subgroupId: z.string().default("all"),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let filtros: AnalyticsFilters;
  try {
    filtros = filtrosSchema.parse(await req.json());
  } catch (err) {
    const detalhe = err instanceof z.ZodError ? err.issues[0]?.message : "corpo inválido";
    return NextResponse.json({ error: `Filtros inválidos: ${detalhe}` }, { status: 400 });
  }

  if (filtros.from > filtros.to) {
    return NextResponse.json({ error: "Período invertido: 'from' é maior que 'to'" }, { status: 400 });
  }

  const db = await getTenantPrisma(session);
  const inicio = Date.now();
  const data = await getVendasData(db, filtros);

  return NextResponse.json({ ...data, ms: Date.now() - inicio });
}
