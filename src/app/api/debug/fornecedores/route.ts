import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getPrisma } = await import("@/lib/server/db");
    const db = await getPrisma();

    const total = await db.$queryRawUnsafe<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM compra_items"
    );

    const porTipo = await db.$queryRawUnsafe<{ tipo: string; count: number }[]>(
      "SELECT pedido_tipo AS tipo, COUNT(*) AS count FROM compra_items GROUP BY pedido_tipo"
    );

    const hasData = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM compra_items LIMIT 1) AS existe"
    );

    const fornecedores = await db.$queryRawUnsafe<{ n: number }[]>(
      "SELECT COUNT(DISTINCT fornecedor_id) AS n FROM compra_items"
    );

    return NextResponse.json({
      total: total[0]?.n ?? 0,
      porTipo,
      hasData: hasData[0]?.existe ?? false,
      fornecedoresUnicos: fornecedores[0]?.n ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "erro desconhecido" },
      { status: 500 }
    );
  }
}
