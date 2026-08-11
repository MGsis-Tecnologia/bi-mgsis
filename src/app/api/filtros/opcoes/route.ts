import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { getOpcoesFiltro } from "@/lib/server/analytics/opcoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Opções dos filtros globais (canal, subgrupo, vendedor, empresa).
 *
 * É GET e sem parâmetros porque a resposta é o universo dos dados da empresa —
 * não depende de período nem dos filtros ativos. O custo real fica no cache por
 * versão do dataset, dentro de `getOpcoesFiltro`.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const db = await getTenantPrisma(session);
  const inicio = Date.now();
  // A chave do cache é a empresa da sessão: cada tenant tem o próprio banco, e
  // portanto as próprias opções.
  const opcoes = await getOpcoesFiltro(db, String(session.empresaId));

  return NextResponse.json({ ...opcoes, ms: Date.now() - inicio });
}
