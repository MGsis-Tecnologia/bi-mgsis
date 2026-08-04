import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { generateToken } from "@/lib/server/tokens";
import type { SessionPayload } from "@/lib/server/auth-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function requireMaster(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || !session.isMaster) return null;
  return session;
}

async function parseId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

// GET /api/master/empresas/[id]/integration-token — só o STATUS. O token em
// si nunca é guardado em texto puro (só o hash), então uma vez gerado é
// impossível reexibi-lo — só dá pra saber se existe um ativo e desde quando.
export async function GET(_req: Request, ctx: Ctx) {
  if (!(await requireMaster())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const catalog = await getCatalogPrisma();
  const ativo = await catalog.integrationToken.findFirst({
    where: { empresaId: id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    active: !!ativo,
    createdAt: ativo?.createdAt ?? null,
  });
}

// POST /api/master/empresas/[id]/integration-token — revoga qualquer token
// ativo da empresa e gera um novo. Só existe um token ativo por vez de
// propósito: um ERP não tem como saber qual dos vários usar, e revogar o
// antigo ao gerar um novo evita credencial órfã esquecida por aí.
export async function POST(_req: Request, ctx: Ctx) {
  if (!(await requireMaster())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const catalog = await getCatalogPrisma();
  const empresa = await catalog.empresa.findUnique({ where: { id } });
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  const { token, hash } = generateToken();

  await catalog.$transaction([
    catalog.integrationToken.updateMany({
      where: { empresaId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    catalog.integrationToken.create({ data: { empresaId: id, tokenHash: hash } }),
  ]);

  return NextResponse.json({ ok: true, integrationToken: token });
}
