import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant";
import {
  getComparativoData,
  getComparativoItem,
  getComparativoLista,
} from "@/lib/server/analytics/comparativo";
import type { AnalyticsFilters } from "@/lib/server/analytics/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sem `from`/`to`: a comparação anual cobre todo o histórico por definição.
const base = z.object({
  dimensao: z.enum(["vendedores", "subgrupos", "marcas", "canais", "clientes", "produtos", "fornecedores"]),
  currency: z.enum(["ALL", "1", "2", "3"]).default("ALL"),
  empresaId: z.string().default("all"),
});

/**
 * Três modos, porque a tela pede três coisas diferentes:
 *  - `resumo` — os maiores itens, para o gráfico da visão geral;
 *  - `lista`  — uma página da tabela com TODOS os itens, com busca e ordenação;
 *  - `item`   — a série mensal de um item, depois do clique.
 */
const corpoSchema = z.discriminatedUnion("modo", [
  base.extend({ modo: z.literal("resumo") }),
  base.extend({
    modo: z.literal("lista"),
    busca: z.string().max(100).default(""),
    // "total", "nome" ou um ano. É o que decide o ORDER BY, então nada além disso passa.
    ordem: z.string().regex(/^(total|nome|\d{4})$/, "ordem inválida").default("total"),
    direcao: z.enum(["asc", "desc"]).default("desc"),
    offset: z.number().int().min(0).max(1_000_000).default(0),
    limite: z.number().int().min(1).max(100).default(50),
  }),
  base.extend({ modo: z.literal("item"), chave: z.string().max(255) }),
]);

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

  const { db, moedaPadrao } = await getTenantContext(session);

  // A tela ignora canal/vendedor/subgrupo e período — o módulo usa escopo base.
  const filtros: AnalyticsFilters = {
    from: "0000-01-01",
    to: "9999-12-31",
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

  if (corpo.modo === "lista") {
    const lista = await getComparativoLista(db, filtros, corpo.dimensao, {
      busca: corpo.busca,
      ordem: corpo.ordem,
      direcao: corpo.direcao,
      offset: corpo.offset,
      limite: corpo.limite,
    });
    return NextResponse.json({ ...lista, ms: Date.now() - inicio });
  }

  if (corpo.modo === "item") {
    const item = await getComparativoItem(db, filtros, corpo.dimensao, corpo.chave);
    return NextResponse.json({ item, ms: Date.now() - inicio });
  }

  const data = await getComparativoData(db, filtros, corpo.dimensao);
  return NextResponse.json({ ...data, ms: Date.now() - inicio });
}
