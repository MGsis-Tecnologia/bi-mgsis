import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { getEstoqueData } from "@/lib/server/analytics/estoque";
import type { AnalyticsFilters } from "@/lib/server/analytics/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD");

const corpoSchema = z.object({
  from: dataISO,
  to: dataISO,
  currency: z.enum(["ALL", "1", "2", "3"]).default("ALL"),
  rates: z.record(z.string(), z.number().positive()).default({}),
  empresaId: z.string().default("all"),
  channel: z.string().default("all"),
  sellerId: z.string().default("all"),
  subgroupId: z.string().default("all"),
  hoje: dataISO,
  status: z
    .enum(["all", "rupture", "risk", "normal", "excess", "no_movement"])
    .default("all"),
  busca: z.string().max(120).default(""),
  limite: z.number().int().min(1).max(500).default(200),
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

  const filtros: AnalyticsFilters = {
    from: corpo.from,
    to: corpo.to,
    cmpFrom: null,
    cmpTo: null,
    currency: corpo.currency,
    rates: corpo.rates,
    empresaId: corpo.empresaId,
    channel: corpo.channel,
    sellerId: corpo.sellerId,
    subgroupId: corpo.subgroupId,
  };

  const db = await getTenantPrisma(session);
  const inicio = Date.now();
  const data = await getEstoqueData(db, filtros, {
    hoje: corpo.hoje,
    status: corpo.status,
    busca: corpo.busca,
    limite: corpo.limite,
  });

  return NextResponse.json({ ...data, ms: Date.now() - inicio });
}
