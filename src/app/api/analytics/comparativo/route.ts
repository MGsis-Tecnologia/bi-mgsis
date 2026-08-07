import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { getComparativoData } from "@/lib/server/analytics/comparativo";
import type { AnalyticsFilters } from "@/lib/server/analytics/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sem `from`/`to`: a comparação anual cobre todo o histórico por definição.
const corpoSchema = z.object({
  dimensao: z.enum(["vendedores", "subgrupos", "canais", "clientes", "produtos"]),
  currency: z.enum(["ALL", "1", "2", "3"]).default("ALL"),
  rates: z.record(z.string(), z.number().positive()).default({}),
  empresaId: z.string().default("all"),
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

  // A tela ignora canal/vendedor/subgrupo e período — o módulo usa escopo base.
  const filtros: AnalyticsFilters = {
    from: "0000-01-01",
    to: "9999-12-31",
    cmpFrom: null,
    cmpTo: null,
    currency: corpo.currency,
    rates: corpo.rates,
    empresaId: corpo.empresaId,
    channel: "all",
    sellerId: "all",
    subgroupId: "all",
  };

  const db = await getTenantPrisma(session);
  const inicio = Date.now();
  const data = await getComparativoData(db, filtros, corpo.dimensao);

  return NextResponse.json({ ...data, ms: Date.now() - inicio });
}
