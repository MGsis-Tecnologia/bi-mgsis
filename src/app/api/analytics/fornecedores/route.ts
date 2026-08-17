import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant";
import { getFornecedoresData } from "@/lib/server/analytics/fornecedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const filtroSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cmpFrom: z.string().nullable().optional().default(null),
  cmpTo: z.string().nullable().optional().default(null),
  currency: z.string().default("ALL"),
  empresaId: z.string().default("all"),
  channel: z.string().default("all"),
  sellerId: z.string().default("all"),
  subgroupId: z.string().default("all"),
});

export async function POST(req: Request) {
  const inicio = Date.now();

  const sessao = await getSession();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const tenant = await getTenantContext(sessao.empresaId);
  if (!tenant) {
    return NextResponse.json({ ok: false, erro: "Empresa não encontrada" }, { status: 404 });
  }

  let corpo: z.infer<typeof filtroSchema>;
  try {
    corpo = filtroSchema.parse(await req.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, erro: `Filtro inválido: ${e.issues[0]?.message}` },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }

  const hoje = new Date().toISOString().split("T")[0];

  const data = await getFornecedoresData(tenant.db, {
    from: corpo.from,
    to: corpo.to,
    cmpFrom: corpo.cmpFrom,
    cmpTo: corpo.cmpTo,
    currency: corpo.currency,
    moedaPadrao: tenant.moedaPadrao,
    empresaId: corpo.empresaId,
    channel: corpo.channel,
    sellerId: corpo.sellerId,
    subgroupId: corpo.subgroupId,
  }, hoje);

  return NextResponse.json({
    ok: true,
    data,
    ms: Date.now() - inicio,
  });
}
