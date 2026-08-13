import type { PrismaClient } from "@prisma/client";
import { MIN_PROPOSTAS, TOP_PRODUTOS } from "@/lib/analytics/prospeccao";
import { Params, consultaAnalitica, exprTaxa, joinCambio, type AnalyticsFilters } from "./base";

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
  /** Orçamentos na base toda. Só é preenchido quando o período volta vazio. */
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
  return {
    // Cotação do dia do orçamento — ver joinCambio em base.ts.
    join: joinCambio(f, p, "o.orcamento_data", "o.moeda_id"),
    expr: `o.item_total * ${exprTaxa(f)}`,
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
   * Linhas do período. Cada consulta pede só as colunas que usa, e nenhuma
   * carrega CTE que não vai ler: uma CTE referenciada mais de uma vez o
   * Postgres materializa em disco em vez de embutir no plano. Era o que
   * acontecia com `produtos`, que arrastava junto `quotes`/`com_status` sem
   * usá-las — a segunda referência bastava para derrubar a paralelização e
   * custava 1 s por requisição.
   */
  const cteFiltrado = (p: Params, colunas: string) => {
    const { join, expr } = exprValor(f, p);
    return `
      filtrado AS (
        SELECT ${colunas}, ${expr} AS valor
        FROM orcamento_items o ${join}
        WHERE ${whereFiltros(f, p)}
      )`;
  };

  /**
   * Orçamentos consolidados. As premissas foram verificadas na base: cada
   * `orcamento_id` tem um único vendedor, cliente, moeda e data (302.444
   * orçamentos), então `MIN()` devolve o valor único, não um arbitrário.
   */
  const cteQuotes = (p: Params) => {
    return `${cteFiltrado(
      p,
      `o.orcamento_id, o.orcamento_data, o.orcamento_confirmado,
               o.orcamento_data_confirmacao, o.vendedor_nome, o.cliente_nome`
    )},
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
    const [row] = await consultaAnalitica<Record<string, unknown>>(db, sql, p.values);
    return row ?? {};
  };

  /**
   * Produtos, no nível do ITEM. `vezesProposto` conta linhas: verifiquei que
   * `item_orcamento_id` é único por linha (1.141.549 de 1.141.549), então o
   * `Set` do código antigo equivale a `COUNT(*)` — sem `COUNT(DISTINCT)`.
   *
   * O fabricante vem do próprio orçamento; se vier vazio, cai no cadastro de
   * Estoque, como no original.
   *
   * `valor` é o total ORÇADO do produto no período (soma de `item_total`,
   * convertida), não o convertido: entra a linha confirmada e a não confirmada.
   * É de propósito — a coluna responde "quanto de negócio esse produto
   * movimenta em proposta", que é o que dá peso à taxa ao lado. Difere da
   * tabela de vendedores, onde o valor é só o que foi convertido.
   *
   * O recorte (ver as constantes) é o que mantém a tela leve: sem ele são
   * 30.715 produtos e 4,9 MB de resposta num período de 12 meses, todos
   * renderizados numa tabela de 420 px que ninguém percorre até o fim.
   * A ordem é por volume orçado primeiro e pior conversão depois, então o
   * recorte fica com os produtos que mais aparecem em proposta — e o mínimo de
   * propostas só corta a cauda, onde 1 ou 2 orçamentos não sustentam uma taxa.
   */
  const produtos = async () => {
    const p = new Params();
    const sql = `WITH ${cteFiltrado(
      p,
      `o.produto_id, o.produto_descricao, o.produto_fabricante,
               o.item_quantidade_confirmada`
    )},
      agg AS (
        SELECT COALESCE(NULLIF(produto_id, ''), NULLIF(produto_descricao, ''), ${p.add(SEM_NOME)}) AS chave,
               MIN(produto_id) AS produto_id,
               COALESCE(MIN(NULLIF(produto_descricao, '')), ${p.add(SEM_NOME)}) AS produto,
               MIN(NULLIF(produto_fabricante, '')) AS fabricante_arquivo,
               COUNT(*)::int AS vezes_proposto,
               COUNT(*) FILTER (WHERE item_quantidade_confirmada > 0)::int AS vezes_confirmado,
               COALESCE(SUM(valor), 0) AS valor
        FROM filtrado GROUP BY 1
      ),
      -- Mais orçado primeiro; entre os de mesmo volume, a pior conversão na
      -- frente. A taxa usa a mesma fórmula de \`taxa()\` para o corte cair nos
      -- mesmos produtos que a ordenação do cliente escolheria. \`COLLATE "C"\`
      -- no desempate final: a ordem precisa ser estável entre execuções, e a do
      -- banco não é a do navegador.
      recorte AS (
        SELECT * FROM agg
        WHERE vezes_proposto >= ${MIN_PROPOSTAS}
        ORDER BY vezes_proposto DESC,
                 round((vezes_confirmado::numeric / vezes_proposto) * 1000) / 10 ASC,
                 produto_id COLLATE "C" ASC
        LIMIT ${TOP_PRODUTOS}
      )
      SELECT r.produto_id, r.produto, r.vezes_proposto, r.vezes_confirmado, r.valor,
             -- Correlacionado, e não um LEFT JOIN com o cadastro inteiro
             -- agregado: são ${TOP_PRODUTOS} buscas por índice contra o
             -- agrupamento de 111 mil linhas de \`inventory_items\`.
             COALESCE(r.fabricante_arquivo,
                      (SELECT MIN(iv.manufacturer_code) FROM inventory_items iv
                        WHERE iv.product_id = r.produto_id AND iv.manufacturer_code <> ''),
                      '') AS fabricante
      FROM recorte r`;
    return consultaAnalitica<{
      produto_id: string; produto: string; vezes_proposto: number;
      vezes_confirmado: number; valor: unknown; fabricante: string;
    }>(db, sql, p.values);
  };

  /**
   * Orçamentos existentes ignorando TODOS os filtros — distingue "nada
   * importado" de "nada no período". Varre a tabela inteira (1,4 s em 1,1 mi de
   * linhas), então só roda quando o período volta vazio, que é o único momento
   * em que a tela lê o número. Com dados na tela o campo vem 0.
   */
  const totalGeral = async (): Promise<number> => {
    const [row] = await consultaAnalitica<{ n: number }>(
      db,
      `SELECT COUNT(*)::int AS n FROM (
         SELECT orcamento_id FROM orcamento_items GROUP BY orcamento_id) t`
    );
    return row?.n ?? 0;
  };

  const [r, prods] = await Promise.all([resumo(), produtos()]);

  const kpi = (r.kpi ?? {}) as Record<string, number>;
  const totalQuotes = Number(kpi.total ?? 0);
  if (totalQuotes === 0) return { ...PROSPECCAO_VAZIA, totalGeral: await totalGeral() };

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
      // Mesma ordem do SQL: mais orçado primeiro, pior conversão no empate, id
      // por último. O SQL já entrega ordenado; isto só reordena os empates pelo
      // locale, que é o critério que a tela sempre usou.
      .sort(
        (a, b) =>
          b.vezesProposto - a.vezesProposto ||
          a.taxa - b.taxa ||
          a.produtoId.localeCompare(b.produtoId)
      ),
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
    // Só a tela vazia lê este número — ver `totalGeral()`.
    totalGeral: 0,
  };
}
