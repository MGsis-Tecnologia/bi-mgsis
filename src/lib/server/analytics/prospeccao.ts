import type { PrismaClient } from "@prisma/client";
import { Params, type AnalyticsFilters } from "./base";

/**
 * Agregações da tela de Prospecção.
 *
 * Primeira tela migrada que NÃO sai de `sale_items`: os dados vêm de
 * `orcamento_items`, com o código do fabricante vindo de `inventory_items`.
 * Por isso as CTEs de `base.ts` não servem aqui — só o contrato de filtros e o
 * acumulador de parâmetros são reaproveitados.
 *
 * Filtros aplicáveis: empresa, moeda e período (sobre `orcamento_data`).
 * Canal, vendedor e subgrupo não existem neste dataset.
 */

export type QuoteStatus = "ganho" | "aberto" | "perdido";

export interface ProspeccaoData {
  kpis: {
    total: number;
    ganhos: number;
    perdidos: number;
    abertos: number;
    taxaConversao: number;
    valorTotal: number;
    valorGanho: number;
    valorEmRisco: number;
    ticketMedio: number;
    itensPorOrcamento: number;
    tempoMedioDias: number;
  };
  status: { key: QuoteStatus; count: number; valor: number }[];
  evolucao: { mes: string; criados: number; confirmados: number; taxa: number; valor: number }[];
  vendedores: { vendedor: string; total: number; confirmados: number; taxa: number; valor: number }[];
  produtos: {
    produtoId: string;
    produto: string;
    fabricante: string;
    vezesProposto: number;
    vezesConfirmado: number;
    taxa: number;
    valor: number;
  }[];
  clientes: { cliente: string; orcamentos: number; confirmados: number; taxa: number; valor: number }[];
  /** `dias` é calculado no cliente, a partir de `data`. */
  pendentes: { orcamento_id: string; cliente_nome: string; valor: number; data: string }[];
  totalGeral: number;
}

const SEM_NOME = "—";

/** Mesma fórmula do código antigo: percentual com uma casa. */
const taxa = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

export const PROSPECCAO_VAZIA: ProspeccaoData = {
  kpis: {
    total: 0, ganhos: 0, perdidos: 0, abertos: 0, taxaConversao: 0,
    valorTotal: 0, valorGanho: 0, valorEmRisco: 0, ticketMedio: 0,
    itensPorOrcamento: 0, tempoMedioDias: 0,
  },
  status: [], evolucao: [], vendedores: [], produtos: [], clientes: [], pendentes: [],
  totalGeral: 0,
};

/** Conversão de moeda: mesma regra do `valorItem` original. */
function exprValor(f: AnalyticsFilters, p: Params): { join: string; expr: string } {
  if (f.currency !== "ALL") return { join: "", expr: "o.item_total" };
  const linhas = Object.entries(f.rates);
  if (linhas.length === 0) return { join: "", expr: "o.item_total" };
  const values = linhas
    .map(([mid, t]) => `(${p.add(mid)}::text, ${p.add(t)}::double precision)`)
    .join(", ");
  return {
    join: `LEFT JOIN (VALUES ${values}) AS r(mid, taxa) ON r.mid = o.moeda_id`,
    expr: "o.item_total * COALESCE(r.taxa, 1)",
  };
}

function whereFiltros(f: AnalyticsFilters, p: Params): string {
  const cond = [`o.orcamento_data >= ${p.add(f.from)}`, `o.orcamento_data <= ${p.add(f.to)}`];
  if (f.empresaId !== "all") cond.push(`o.empresa_id = ${p.add(f.empresaId)}`);
  if (f.currency !== "ALL") cond.push(`o.moeda_id = ${p.add(f.currency)}`);
  return cond.join(" AND ");
}

/**
 * `limitePerdido` é a data-limite calculada NO CLIENTE (ver o hook): um
 * orçamento em aberto vira "perdido" 30 dias depois de criado, e o "hoje" que
 * define isso é o do navegador — mesma regra da segmentação RFM em /clientes.
 */
export async function getProspeccaoData(
  db: PrismaClient,
  f: AnalyticsFilters,
  limitePerdido: string
): Promise<ProspeccaoData> {
  /**
   * Orçamentos consolidados. As premissas foram verificadas na base: cada
   * `orcamento_id` tem um único vendedor, cliente, moeda e data (302.444
   * orçamentos), então `MIN()` devolve o valor único, não um arbitrário.
   */
  const cteQuotes = (p: Params) => {
    const { join, expr } = exprValor(f, p);
    return `
      filtrado AS (
        SELECT o.orcamento_id, o.orcamento_data, o.orcamento_confirmado,
               o.orcamento_data_confirmacao, o.vendedor_nome, o.cliente_nome,
               o.item_orcamento_id, o.produto_id, o.produto_descricao,
               o.produto_fabricante, o.item_quantidade_confirmada,
               ${expr} AS valor
        FROM orcamento_items o ${join}
        WHERE ${whereFiltros(f, p)}
      ),
      quotes AS (
        SELECT orcamento_id AS id,
               MIN(orcamento_data) AS data,
               MAX(orcamento_data_confirmacao) AS data_confirmacao,
               BOOL_OR(orcamento_confirmado) AS confirmado,
               COALESCE(MIN(NULLIF(vendedor_nome, '')), '') AS vendedor,
               COALESCE(MIN(NULLIF(cliente_nome, '')), '') AS cliente,
               SUM(valor) AS valor,
               COUNT(*)::int AS itens
        FROM filtrado GROUP BY orcamento_id
      ),
      com_status AS (
        SELECT q.*,
               CASE WHEN q.confirmado THEN 'ganho'
                    WHEN q.data <= ${p.add(limitePerdido)} THEN 'perdido'
                    ELSE 'aberto' END AS status
        FROM quotes q
      )`;
  };

  /** KPIs, distribuição por status e evolução mensal — tudo do nível orçamento. */
  const resumo = async () => {
    const p = new Params();
    const sql = `WITH ${cteQuotes(p)},
      kpi AS (
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'ganho')::int   AS ganhos,
               COUNT(*) FILTER (WHERE status = 'perdido')::int AS perdidos,
               COUNT(*) FILTER (WHERE status = 'aberto')::int  AS abertos,
               COALESCE(SUM(valor), 0) AS valor_total,
               COALESCE(SUM(valor) FILTER (WHERE status = 'ganho'), 0) AS valor_ganho,
               COALESCE(SUM(itens), 0)::int AS itens_total,
               -- Só entram os confirmados COM data de confirmação, como no original.
               COALESCE(SUM(data_confirmacao::date - data::date)
                        FILTER (WHERE confirmado AND data_confirmacao <> ''), 0) AS soma_dias,
               COUNT(*) FILTER (WHERE confirmado AND data_confirmacao <> '')::int AS com_data
        FROM com_status
      ),
      por_status AS (
        SELECT status, COUNT(*)::int AS count, COALESCE(SUM(valor), 0) AS valor
        FROM com_status GROUP BY status
      ),
      por_mes AS (
        SELECT substring(data, 1, 7) AS mes, COUNT(*)::int AS criados,
               COUNT(*) FILTER (WHERE confirmado)::int AS confirmados,
               COALESCE(SUM(valor), 0) AS valor
        FROM com_status GROUP BY 1 ORDER BY 1
      ),
      vend AS (
        SELECT COALESCE(NULLIF(vendedor, ''), ${p.add(SEM_NOME)}) AS vendedor,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE confirmado)::int AS confirmados,
               -- Valor do vendedor = só o que ele converteu (regra do original).
               COALESCE(SUM(valor) FILTER (WHERE confirmado), 0) AS valor
        FROM com_status GROUP BY 1
      ),
      cli AS (
        SELECT COALESCE(NULLIF(cliente, ''), ${p.add(SEM_NOME)}) AS cliente,
               COUNT(*)::int AS orcamentos,
               COUNT(*) FILTER (WHERE confirmado)::int AS confirmados,
               COALESCE(SUM(valor), 0) AS valor
        FROM com_status GROUP BY 1 ORDER BY 4 DESC, 1 LIMIT 20
      ),
      -- Desempate explícito pelo id. Sem ele, "os 15 mais antigos" é ambíguo:
      -- há 372 orçamentos só na data mais antiga do período típico, e o LIMIT
      -- escolheria 15 quaisquer, mudando entre execuções.
      pend AS (
        SELECT id, COALESCE(NULLIF(cliente, ''), ${p.add(SEM_NOME)}) AS cliente, valor, data
        FROM com_status WHERE status = 'perdido' ORDER BY data ASC, id ASC LIMIT 15
      )
      SELECT (SELECT row_to_json(x) FROM kpi x) AS kpi,
             (SELECT COALESCE(json_agg(x), '[]'::json) FROM por_status x) AS status,
             (SELECT COALESCE(json_agg(x ORDER BY x.mes), '[]'::json) FROM por_mes x) AS meses,
             (SELECT COALESCE(json_agg(x), '[]'::json) FROM vend x) AS vendedores,
             (SELECT COALESCE(json_agg(x ORDER BY x.valor DESC, x.cliente), '[]'::json) FROM cli x) AS clientes,
             (SELECT COALESCE(json_agg(x ORDER BY x.data ASC, x.id ASC), '[]'::json) FROM pend x) AS pendentes`;
    const [row] = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...p.values);
    return row ?? {};
  };

  /**
   * Produtos, no nível do ITEM. `vezesProposto` conta linhas: verifiquei que
   * `item_orcamento_id` é único por linha (1.141.549 de 1.141.549), então o
   * `Set` do código antigo equivale a `COUNT(*)` — sem `COUNT(DISTINCT)`.
   *
   * O fabricante vem do próprio orçamento; se vier vazio, cai no cadastro de
   * Estoque, como no original.
   */
  const produtos = async () => {
    const p = new Params();
    const sql = `WITH ${cteQuotes(p)},
      inv AS (
        SELECT product_id, MIN(manufacturer_code) AS mfr
        FROM inventory_items WHERE manufacturer_code <> '' GROUP BY product_id
      ),
      agg AS (
        SELECT COALESCE(NULLIF(produto_id, ''), NULLIF(produto_descricao, ''), ${p.add(SEM_NOME)}) AS chave,
               MIN(produto_id) AS produto_id,
               COALESCE(MIN(NULLIF(produto_descricao, '')), ${p.add(SEM_NOME)}) AS produto,
               MIN(NULLIF(produto_fabricante, '')) AS fabricante_arquivo,
               COUNT(*)::int AS vezes_proposto,
               COUNT(*) FILTER (WHERE item_quantidade_confirmada > 0)::int AS vezes_confirmado,
               COALESCE(SUM(valor), 0) AS valor
        FROM filtrado GROUP BY 1
      )
      SELECT a.produto_id, a.produto, a.vezes_proposto, a.vezes_confirmado, a.valor,
             COALESCE(a.fabricante_arquivo, i.mfr, '') AS fabricante
      FROM agg a LEFT JOIN inv i ON i.product_id = a.produto_id`;
    return db.$queryRawUnsafe<
      {
        produto_id: string; produto: string; vezes_proposto: number;
        vezes_confirmado: number; valor: unknown; fabricante: string;
      }[]
    >(sql, ...p.values);
  };

  /** Orçamentos existentes ignorando TODOS os filtros — distingue "nada importado". */
  const totalGeral = async (): Promise<number> => {
    const [row] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT orcamento_id FROM orcamento_items GROUP BY orcamento_id) t`
    );
    return row?.n ?? 0;
  };

  const [r, prods, total] = await Promise.all([resumo(), produtos(), totalGeral()]);

  const kpi = (r.kpi ?? {}) as Record<string, number>;
  const totalQuotes = Number(kpi.total ?? 0);
  if (totalQuotes === 0) return { ...PROSPECCAO_VAZIA, totalGeral: total };

  const valorTotal = Number(kpi.valor_total ?? 0);
  const valorGanho = Number(kpi.valor_ganho ?? 0);
  const ganhos = Number(kpi.ganhos ?? 0);
  const comData = Number(kpi.com_data ?? 0);

  const statusRows = (r.status ?? []) as { status: string; count: number; valor: unknown }[];
  const porStatus = new Map(statusRows.map((s) => [s.status, s]));

  return {
    kpis: {
      total: totalQuotes,
      ganhos,
      perdidos: Number(kpi.perdidos ?? 0),
      abertos: Number(kpi.abertos ?? 0),
      taxaConversao: taxa(ganhos, totalQuotes),
      valorTotal,
      valorGanho,
      valorEmRisco: Math.max(0, valorTotal - valorGanho),
      ticketMedio: totalQuotes > 0 ? valorTotal / totalQuotes : 0,
      itensPorOrcamento: totalQuotes > 0 ? Number(kpi.itens_total ?? 0) / totalQuotes : 0,
      tempoMedioDias:
        comData > 0 ? Math.round((Number(kpi.soma_dias ?? 0) / comData) * 10) / 10 : 0,
    },
    // Ordem fixa, como no original.
    status: (["ganho", "aberto", "perdido"] as QuoteStatus[]).map((key) => ({
      key,
      count: porStatus.get(key)?.count ?? 0,
      valor: Number(porStatus.get(key)?.valor ?? 0),
    })),
    evolucao: ((r.meses ?? []) as { mes: string; criados: number; confirmados: number; valor: unknown }[])
      .map((m) => ({
        mes: m.mes,
        criados: m.criados,
        confirmados: m.confirmados,
        taxa: taxa(m.confirmados, m.criados),
        valor: Number(m.valor),
      })),
    vendedores: ((r.vendedores ?? []) as { vendedor: string; total: number; confirmados: number; valor: unknown }[])
      .map((v) => ({
        vendedor: v.vendedor,
        total: v.total,
        confirmados: v.confirmados,
        taxa: taxa(v.confirmados, v.total),
        valor: Number(v.valor),
      }))
      // Desempate pelo nome — sem ele a ordem entre vendedores com os mesmos
      // números mudaria a cada execução.
      .sort((a, b) =>
        b.confirmados - a.confirmados || b.total - a.total || a.vendedor.localeCompare(b.vendedor)
      ),
    produtos: prods
      .map((p) => ({
        produtoId: p.produto_id,
        produto: p.produto,
        fabricante: p.fabricante,
        vezesProposto: p.vezes_proposto,
        vezesConfirmado: p.vezes_confirmado,
        taxa: taxa(p.vezes_confirmado, p.vezes_proposto),
        valor: Number(p.valor),
      }))
      // A taxa é um percentual arredondado, então há muito empate — 7.486
      // produtos em 100% num período típico. O id define a ordem entre eles.
      .sort((a, b) => a.taxa - b.taxa || a.produtoId.localeCompare(b.produtoId)),
    clientes: ((r.clientes ?? []) as { cliente: string; orcamentos: number; confirmados: number; valor: unknown }[])
      .map((c) => ({
        cliente: c.cliente,
        orcamentos: c.orcamentos,
        confirmados: c.confirmados,
        taxa: taxa(c.confirmados, c.orcamentos),
        valor: Number(c.valor),
      })),
    pendentes: ((r.pendentes ?? []) as { id: string; cliente: string; valor: unknown; data: string }[])
      .map((q) => ({
        orcamento_id: q.id,
        cliente_nome: q.cliente,
        valor: Number(q.valor),
        data: q.data,
      })),
    totalGeral: total,
  };
}
