import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant";
import { getClientesData } from "@/lib/server/analytics/clientes";

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
  // "Hoje" do NAVEGADOR: a recência da segmentação RFM era calculada com
  // Date.now() no cliente. Vindo daqui, o resultado não muda com o fuso do
  // servidor nem com a hora em que a página é aberta.
  hoje: dataISO,
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  let corpo: z.infer<typeof filtrosSchema>;
  try {
    corpo = filtrosSchema.parse(await req.json());
  } catch (err) {
    const detalhe = err instanceof z.ZodError ? err.issues[0]?.message : "corpo inválido";
    return NextResponse.json({ error: `Filtros inválidos: ${detalhe}` }, { status: 400 });
  }

  if (corpo.from > corpo.to) {
    return NextResponse.json({ error: "Período invertido: 'from' é maior que 'to'" }, { status: 400 });
  }

  const { hoje, ...filtros } = corpo;
  const { db, moedaPadrao } = await getTenantContext(session);
  const inicio = Date.now();
  const data = await getClientesData(db, { ...filtros, moedaPadrao }, hoje);

  return NextResponse.json({ ...data, ms: Date.now() - inicio });
}
