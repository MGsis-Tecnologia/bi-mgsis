import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant";
import { getPagarData } from "@/lib/server/analytics/pagar";
import type { AnalyticsFilters } from "@/lib/server/analytics/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD");

const corpoSchema = z.object({
  from: dataISO,
  to: dataISO,
  currency: z.enum(["ALL", "1", "2", "3"]).default("ALL"),
  empresaId: z.string().default("all"),
  hoje: dataISO,
  aplicarLimiteSuperior: z.boolean().default(false),
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

  if (corpo.aplicarLimiteSuperior && corpo.from > corpo.to) {
    return NextResponse.json({ error: "Período invertido: 'from' é maior que 'to'" }, { status: 400 });
  }

  const { db, moedaPadrao } = await getTenantContext(session);

  // Canal, vendedor e subgrupo não existem em payable_items.
  const filtros: AnalyticsFilters = {
    from: corpo.from,
    to: corpo.to,
    cmpFrom: null,
    cmpTo: null,
    currency: corpo.currency,
    moedaPadrao,
    empresaId: corpo.empresaId,
    channel: "all",
    sellerId: "all",
    subgroupId: "all",
  };

  const inicio = Date.now();
  const data = await getPagarData(db, filtros, {
    hoje: corpo.hoje,
    aplicarLimiteSuperior: corpo.aplicarLimiteSuperior,
  });

  return NextResponse.json({ ...data, ms: Date.now() - inicio });
}
