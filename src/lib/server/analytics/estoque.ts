import type { PrismaClient } from "@prisma/client";
import {
  Params,
  WORK_MEM,
  consultaAnalitica,
  exprTaxa,
  joinCambio,
  whereGraficos,
  type AnalyticsFilters,
} from "./base";

/**
 * Agregações da tela de Estoque.
 *
 * É a única que cruza duas tabelas grandes: o snapshot `inventory_items`
 * (111.970 linhas) e o movimento de `sale_items` no período. Mandar as linhas
 * para o navegador está fora de questão — são 76.708 SKUs —, então a busca por
 * texto e o filtro de situação também passam a ser resolvidos aqui, e a tabela
 * volta paginada.
 *
 * **A unidade da tela é o SKU, não a linha do snapshot.** O snapshot tem uma
 * linha por (produto, empresa) — verificado: o par é único, e 35.262 dos 76.708
 * SKUs existem nas duas empresas. `e_inv` consolida por `product_id`, somando
 * estoque, estoque mínimo e capital; descrição e fabricante vêm da linha de
 * menor `id` (conferido: são idênticos entre empresas em todos os SKUs
 * compartilhados). Com uma empresa selecionada o agrupamento é inócuo, porque
 * já existe uma linha só por produto.
 *
 * Isso corrige a demanda contada em dobro: antes cada linha do snapshot recebia
 * o movimento INTEIRO do produto, então com "todas as empresas" um SKU presente
 * nas duas somava a própria demanda duas vezes nas agregações por categoria.
 * Era o que o código antigo fazia (`for (const item of inventory)`), replicado
 * fielmente na fase B e corrigido em 11/08/2026 por decisão de produto:
 * **demanda por SKU, contada uma vez**.
 *
 * Uma particularidade do comportamento antigo segue mantida de propósito: um
 * SKU vendido no período mas ausente do snapshot entra como ruptura, com
 * estoque 0.
 */

const RISK_DAYS = 15;
const EXCESS_DAYS = 180;
const DAYS_PER_MONTH = 30.44;

export type StockStatus = "rupture" | "risk" | "normal" | "excess" | "no_movement";

export interface EstoqueRow {
  productId: string;
  description: string;
  manufacturerCode: string;
  subgroupId: string;
  subgroupName: string;
  stock: number;
  minStock: number;
  costTotalUSD: number;
  unitCostUSD: number;
  unitsSold: number;
  revenueSold: number;
  costSold: number;
  ordersCount: number;
  lastSaleDate: string;
  /** null = nunca vendido (o `Infinity` do código antigo não sobrevive a JSON). */
  coverageDays: number | null;
  avgDailyDemand: number;
  status: StockStatus;
  hasInventory: boolean;
}

export interface EstoqueData {
  totals: {
    skus: number;
    skusInStock: number;
    totalUnits: number;
    totalValueUSD: number;
    rupture: number;
    risk: number;
    excess: number;
    noMovement: number;
    normal: number;
    skusMissingFromInventory: number;
  };
  byCategory: {
    id: string; name: string; skus: number; units: number;
    valueUSD: number; unitsSold: number; revenueSold: number;
  }[];
  statuses: { key: StockStatus; count: number; valueUSD: number }[];
  coverage: { key: string; count: number; valueUSD: number }[];
  movers: EstoqueRow[];
  dormant: EstoqueRow[];
  ruptureRisk: EstoqueRow[];
  /** Projeção enxuta: a tabela de estoque mínimo só mostra estes campos. */
  belowMinimum: {
    productId: string;
    description: string;
    manufacturerCode: string;
    stock: number;
    minStock: number;
    status: StockStatus;
  }[];
  /** Página da tabela, já com busca e situação aplicadas. */
  rows: EstoqueRow[];
  rowsTotal: number;
  periodDays: number;
  hasData: boolean;
}

export interface OpcoesEstoque {
  /** Data de hoje no relógio do cliente — limita a janela de demanda. */
  hoje: string;
  status: StockStatus | "all";
  busca: string;
  limite: number;
}

/**
 * Janela de demanda: dias REAIS com dados dentro do período, até hoje. Sem
 * isso, o preset "Todos" (2000–2099) diluiria a demanda em ~100 anos e toda a
 * cobertura estouraria.
 */
function calculaPeriodDays(from: string, to: string, hoje: string, primeiraVenda: string | null): number {
  const dia = 86400000;
  const ms = (d: string) => Date.parse(d + "T00:00:00Z");
  const ate = Math.min(ms(to), ms(hoje));
  const de = primeiraVenda ? Math.max(ms(from), ms(primeiraVenda)) : ms(from);
  return Math.max(1, Math.round((ate - de) / dia) + 1);
}

export async function getEstoqueData(
  db: PrismaClient,
  f: AnalyticsFilters,
  o: OpcoesEstoque
): Promise<EstoqueData> {
  const [semDados] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
    "SELECT EXISTS (SELECT 1 FROM inventory_items) AS existe"
  );
  if (!semDados?.existe) {
    return {
      totals: {
        skus: 0, skusInStock: 0, totalUnits: 0, totalValueUSD: 0, rupture: 0,
        risk: 0, excess: 0, noMovement: 0, normal: 0, skusMissingFromInventory: 0,
      },
      byCategory: [], statuses: [], coverage: [], movers: [], dormant: [],
      ruptureRisk: [], belowMinimum: [], rows: [], rowsTotal: 0,
      periodDays: 1, hasData: false,
    };
  }

  // A janela de demanda precisa da primeira venda do período filtrado, e ela
  // entra como constante no cálculo de cobertura — por isso vem antes.
  const pd = new Params();
  const [pv] = await consultaAnalitica<{ primeira: string | null }>(db, `SELECT MIN(s.date) AS primeira FROM sale_items s ${joinCambio(f, pd, "s.date", "s.currency_id")}
     WHERE ${whereGraficos(f, pd)} AND s.date >= ${pd.add(f.from)} AND s.date <= ${pd.add(f.to)}`, pd.values);
  const periodDays = calculaPeriodDays(f.from, f.to, o.hoje, pv?.primeira ?? null);

  // Moeda específica → mantém só os itens dela, sem converter.
  // "Todas" → converte o custo de cada item pela taxa da sua moeda.
  const converteInv = f.currency === "ALL";

  // ── Por que tabelas temporárias, e não um WITH gigante ────────────────────
  // O Postgres não tem estatística de CTE: ele estimava 8,3 MILHÕES de linhas
  // onde havia 112 mil e, com isso, escolhia merge joins que ordenavam tudo —
  // 6,9 s. Pior: ao deixar a estimativa de `mov` cair para 3 linhas, o
  // anti-join virou nested loop e a consulta foi para 578 SEGUNDOS.
  // Materializar cada passo e rodar ANALYZE dá números reais ao planejador.
  // Todas as temporárias são ON COMMIT DROP, então morrem com a transação.
  const passos: { nome: string; sql: string; params: unknown[] }[] = [];

  const pInv = new Params();
  // O snapshot não tem data de transação — é uma foto do estoque AGORA —, então
  // aqui a conversão usa o câmbio do mês mais recente que existe em
  // `cambio_mensal`, não o do mês de cada linha. `MAX(competencia)` em vez do
  // mês corrente para que um atraso do agente não jogue tudo silenciosamente no
  // COALESCE(taxa, 1). O `substring` do joinCambio sobre 'YYYY-MM' devolve o
  // próprio valor, então a competência entra direto.
  const custoInvP = converteInv ? `i.cost_total_usd * ${exprTaxa(f)}` : "i.cost_total_usd";
  const joinInvP = converteInv
    ? joinCambio(f, pInv, "(SELECT MAX(competencia) FROM cambio_mensal)", "i.currency_id")
    : "";
  const condInvP: string[] = [];
  if (f.empresaId !== "all") condInvP.push(`i.empresa_id = ${pInv.add(f.empresaId)}`);
  if (f.currency !== "ALL") condInvP.push(`i.currency_id = ${pInv.add(f.currency)}`);
  passos.push({
    nome: "e_inv",
    params: pInv.values,
    // Uma linha por SKU, não por (produto, empresa) — ver a nota no topo.
    // `MIN(i.id)` continua servindo de `ord` (ordem de inserção do snapshot) e
    // é reproduzível; `MIN()` em descrição e fabricante é seguro porque não
    // divergem entre empresas.
    sql: `SELECT MIN(i.id) AS id, i.product_id,
                 MIN(i.description) AS description,
                 MIN(i.manufacturer_code) AS manufacturer_code,
                 SUM(i.stock) AS stock, SUM(i.min_stock) AS min_stock,
                 SUM(${custoInvP}) AS cost_total
          FROM inventory_items i ${joinInvP}
          ${condInvP.length ? `WHERE ${condInvP.join(" AND ")}` : ""}
          GROUP BY i.product_id`,
  });

  const pL = new Params();
  passos.push({
    nome: "e_l",
    params: pL.values,
    sql: `SELECT s.id, s.order_id, s.date, s.product_id, s.quantity,
                 s.total_orig * ${exprTaxa(f)} AS total,
                 s.cost_orig  * ${exprTaxa(f)} AS cost
          FROM sale_items s ${joinCambio(f, pL, "s.date", "s.currency_id")}
          WHERE ${whereGraficos(f, pL)}
            AND s.date >= ${pL.add(f.from)} AND s.date <= ${pL.add(f.to)}`,
  });

  // Movimento do período por produto, em duas agregações encadeadas em vez de
  // três passadas separadas sobre as mesmas linhas: agrupando primeiro por
  // (produto, pedido), o COUNT dos pedidos distintos vira um COUNT(*) comum —
  // é o mesmo motivo pelo qual base.ts reduz as linhas a pedidos antes de somar.
  //
  // Nome e subgrupo vêm da PRIMEIRA linha do produto no período, como fazia o
  // Map do código antigo; "primeira" é a de menor id, o que é reproduzível
  // (antes dependia da ordem em que o dataset foi baixado). A volta é em e_l,
  // não em sale_items: 31 mil buscas aleatórias numa tabela de 318 MB custam
  // mais do que um hash join sobre as 340 mil linhas já materializadas.
  passos.push({
    nome: "e_mov",
    params: [],
    sql: `WITH po AS (
            SELECT product_id, order_id,
                   SUM(quantity) AS q, SUM(total) AS t, SUM(cost) AS c,
                   MAX(date) AS d, MIN(id) AS min_id
            FROM e_l GROUP BY product_id, order_id
          ),
          ag AS (
            SELECT product_id, SUM(q) AS units_sold, SUM(t) AS revenue_sold,
                   SUM(c) AS cost_sold, MAX(d) AS last_sale,
                   COUNT(*)::int AS orders_count, MIN(min_id) AS min_id
            FROM po GROUP BY product_id
          )
          SELECT ag.product_id, ag.units_sold, ag.revenue_sold, ag.cost_sold,
                 ag.last_sale, ag.orders_count,
                 n.product_name, n.subgroup_id, n.subgroup_name
          FROM ag JOIN sale_items n ON n.id = ag.min_id`,
  });

  // Catálogo: primeira ocorrência de cada produto na tabela inteira. Só serve
  // de reserva para SKU sem movimento no período.
  //
  // O caminho óbvio (DISTINCT ON ... ORDER BY product_id, id) obriga a ordenar
  // 1,39 milhão de linhas: 3.483 ms medidos. Pegar MIN(id) por produto usa
  // hash aggregate e a volta é por chave primária: 767 ms. Mesmo resultado.
  passos.push({
    nome: "e_cat",
    params: [],
    sql: `SELECT s.product_id, s.product_name, s.subgroup_id, s.subgroup_name
          FROM (
            SELECT product_id, MIN(id) AS id
            FROM sale_items WHERE order_type = 'VENDA' GROUP BY product_id
          ) k
          JOIN sale_items s ON s.id = k.id`,
  });

  const pFin = new Params();
  const diasFin = pFin.add(periodDays);
  const diasFin2 = pFin.add(periodDays);
  passos.push({
    nome: "e_fin",
    params: pFin.values,
    sql: `
  WITH base AS (
    -- Uma linha por SKU: e_inv já consolidou as empresas, então o movimento
    -- do produto entra uma vez só. Ver a nota no topo do arquivo.
    SELECT inv.product_id,
           TRIM(COALESCE(NULLIF(mov.product_name, ''), NULLIF(cat.product_name, ''), inv.description, '')) AS description,
           inv.manufacturer_code,
           COALESCE(mov.subgroup_id, cat.subgroup_id, '')     AS subgroup_id,
           COALESCE(mov.subgroup_name, cat.subgroup_name, '') AS subgroup_name,
           inv.stock, inv.min_stock, inv.cost_total,
           COALESCE(mov.units_sold, 0)   AS units_sold,
           COALESCE(mov.revenue_sold, 0) AS revenue_sold,
           COALESCE(mov.cost_sold, 0)    AS cost_sold,
           COALESCE(mov.orders_count, 0) AS orders_count,
           COALESCE(mov.last_sale, '')   AS last_sale_date,
           -- ord reproduz a ordem de inserção do array antigo: o snapshot
           -- primeiro (na ordem da tabela), depois os SKUs ausentes dele. Os
           -- sort do JS são estáveis, então é isso que desempatava antes.
           true AS has_inventory, inv.id AS ord
    FROM e_inv inv
    LEFT JOIN e_mov mov ON mov.product_id = inv.product_id
    LEFT JOIN e_cat cat ON cat.product_id = inv.product_id

    UNION ALL

    -- Vendeu no período e não está no snapshot: ruptura com estoque 0.
    SELECT mov.product_id,
           TRIM(COALESCE(NULLIF(mov.product_name, ''), NULLIF(cat.product_name, ''), '')) AS description,
           '' AS manufacturer_code, mov.subgroup_id, mov.subgroup_name,
           0 AS stock, 0 AS min_stock, 0 AS cost_total,
           mov.units_sold, mov.revenue_sold, mov.cost_sold, mov.orders_count,
           COALESCE(mov.last_sale, '') AS last_sale_date,
           false AS has_inventory,
           2000000000 + row_number() OVER (ORDER BY mov.product_id) AS ord
    FROM e_mov mov
    LEFT JOIN e_cat cat ON cat.product_id = mov.product_id
    WHERE NOT EXISTS (SELECT 1 FROM e_inv inv WHERE inv.product_id = mov.product_id)
  ),
  calc AS (
    SELECT b.*,
           b.units_sold / ${diasFin}::double precision AS avg_daily_demand,
           -- Mesma ORDEM de operações do código antigo: dividir pela demanda
           -- diária, não multiplicar por periodDays. Matematicamente é igual,
           -- em ponto flutuante não é — um item caía exatamente nos 15 dias e
           -- trocava de "em risco" para "normal".
           CASE WHEN b.stock > 0 AND b.units_sold > 0
                THEN b.stock / (b.units_sold / ${diasFin2}::double precision)
           END AS coverage_days,
           CASE WHEN b.stock > 0 THEN b.cost_total / b.stock ELSE 0 END AS unit_cost
    FROM base b
  )
  SELECT c.*,
         CASE
           WHEN NOT c.has_inventory              THEN 'rupture'
           WHEN c.stock <= 0 AND c.units_sold > 0 THEN 'rupture'
           WHEN c.stock <= 0                      THEN 'no_movement'
           WHEN c.units_sold = 0                  THEN 'no_movement'
           WHEN c.coverage_days <= ${RISK_DAYS}   THEN 'risk'
           WHEN c.coverage_days >= ${EXCESS_DAYS} THEN 'excess'
           ELSE 'normal'
         END AS status
  FROM calc c`,
  });

  const pFim = new Params();
  const sqlFinal = `
  SELECT
    (SELECT row_to_json(t) FROM (
      SELECT COUNT(*)::int AS skus,
             COUNT(*) FILTER (WHERE stock > 0)::int AS "skusInStock",
             COALESCE(SUM(stock), 0) AS "totalUnits",
             COALESCE(SUM(cost_total), 0) AS "totalValueUSD",
             COUNT(*) FILTER (WHERE status = 'rupture')::int AS rupture,
             COUNT(*) FILTER (WHERE status = 'risk')::int AS risk,
             COUNT(*) FILTER (WHERE status = 'excess')::int AS excess,
             COUNT(*) FILTER (WHERE status = 'no_movement')::int AS "noMovement",
             COUNT(*) FILTER (WHERE status = 'normal')::int AS normal,
             COUNT(*) FILTER (WHERE NOT has_inventory)::int AS "skusMissingFromInventory"
      FROM e_fin) t) AS totals,

    (SELECT COALESCE(json_agg(t ORDER BY t."valueUSD" DESC, t.ord), '[]'::json) FROM (
      SELECT COALESCE(NULLIF(subgroup_id, ''), '__none__') AS id,
             -- nome do PRIMEIRO item da categoria, como no Map antigo
             COALESCE(NULLIF((array_agg(subgroup_name ORDER BY ord))[1], ''), 'Sem categoria') AS name,
             COUNT(*)::int AS skus,
             COALESCE(SUM(stock), 0) AS units,
             COALESCE(SUM(cost_total), 0) AS "valueUSD",
             COALESCE(SUM(units_sold), 0) AS "unitsSold",
             COALESCE(SUM(revenue_sold), 0) AS "revenueSold",
             MIN(ord) AS ord
      FROM e_fin GROUP BY 1) t) AS by_category,

    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT status AS key, COUNT(*)::int AS count,
             COALESCE(SUM(cost_total), 0) AS "valueUSD"
      FROM e_fin GROUP BY status ORDER BY status) t) AS statuses,

    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT CASE
               WHEN stock <= 0 THEN 'sem_cobertura'
               WHEN avg_daily_demand <= 0 OR coverage_days IS NULL THEN 'fora_analise'
               WHEN coverage_days / ${DAYS_PER_MONTH} <= 1  THEN 'ate_1'
               WHEN coverage_days / ${DAYS_PER_MONTH} <= 2  THEN '1_2'
               WHEN coverage_days / ${DAYS_PER_MONTH} <= 4  THEN '2_4'
               WHEN coverage_days / ${DAYS_PER_MONTH} <= 6  THEN '4_6'
               WHEN coverage_days / ${DAYS_PER_MONTH} <= 12 THEN '6_12'
               ELSE 'mais_12'
             END AS key,
             COUNT(*)::int AS count, COALESCE(SUM(cost_total), 0) AS "valueUSD"
      FROM e_fin GROUP BY 1) t) AS coverage,

    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT * FROM e_fin WHERE units_sold > 0
      ORDER BY units_sold DESC, ord LIMIT 10) t) AS movers,

    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT * FROM e_fin WHERE stock > 0 AND units_sold = 0
      ORDER BY cost_total DESC, ord LIMIT 10) t) AS dormant,

    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT * FROM e_fin WHERE status IN ('rupture', 'risk')
      ORDER BY (status = 'risk'),
               CASE WHEN status = 'rupture' THEN -revenue_sold ELSE coverage_days END,
               ord
      LIMIT 12) t) AS rupture_risk,

    -- Só os seis campos que a tabela de estoque mínimo mostra: são ~900 linhas
    -- e mandar a linha inteira custava 339 KB dos 479 KB do payload.
    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT product_id, description, manufacturer_code, stock, min_stock, status
      FROM e_fin WHERE min_stock > 0 AND stock <= min_stock
      ORDER BY (min_stock - stock) DESC, ord) t) AS below_minimum,

    (SELECT COUNT(*)::int FROM e_fin WHERE ${filtroTabela(o, pFim)}) AS rows_total,

    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT * FROM e_fin WHERE ${filtroTabela(o, pFim)}
      ORDER BY cost_total DESC, ord LIMIT ${pFim.add(o.limite)}) t) AS page`;

  const r = await db.$transaction(
    async (tx) => {
      // O que falta ao planejador é a cardinalidade, não histograma fino: com o
      // alvo padrão (100) o ANALYZE das cinco temporárias custava 2,5 s. Com 10
      // ele amostra 10× menos, a contagem de linhas continua exata e o plano
      // escolhido é o mesmo. Vale só nesta transação.
      await tx.$executeRawUnsafe("SET LOCAL default_statistics_target = 10");
      // Mesmo ajuste que `consultaAnalitica` faz nas demais consultas de
      // análise — aqui precisa ser explícito porque a transação já existe.
      await tx.$executeRawUnsafe(`SET LOCAL work_mem = '${WORK_MEM}'`);

      for (const passo of passos) {
        await tx.$executeRawUnsafe(
          `CREATE TEMP TABLE ${passo.nome} ON COMMIT DROP AS ${passo.sql}`,
          ...passo.params
        );
        // Sem ANALYZE a temporária nasce sem estatística e o planejador volta a
        // errar exatamente como errava com as CTEs.
        await tx.$executeRawUnsafe(`ANALYZE ${passo.nome}`);
      }
      const [linhaUnica] = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        sqlFinal,
        ...pFim.values
      );
      return linhaUnica;
    },
    { timeout: 120_000, maxWait: 30_000 }
  );

  const linha = (x: Record<string, unknown>): EstoqueRow => ({
    productId: String(x.product_id),
    description: String(x.description ?? ""),
    manufacturerCode: String(x.manufacturer_code ?? ""),
    subgroupId: String(x.subgroup_id ?? ""),
    subgroupName: String(x.subgroup_name ?? ""),
    stock: Number(x.stock),
    minStock: Number(x.min_stock),
    costTotalUSD: Number(x.cost_total),
    unitCostUSD: Number(x.unit_cost),
    unitsSold: Number(x.units_sold),
    revenueSold: Number(x.revenue_sold),
    costSold: Number(x.cost_sold),
    ordersCount: Number(x.orders_count),
    lastSaleDate: String(x.last_sale_date ?? ""),
    coverageDays: x.coverage_days === null || x.coverage_days === undefined
      ? null
      : Number(x.coverage_days),
    avgDailyDemand: Number(x.avg_daily_demand),
    status: x.status as StockStatus,
    hasInventory: Boolean(x.has_inventory),
  });

  const lista = (v: unknown) => ((v ?? []) as Record<string, unknown>[]).map(linha);
  const t = (r?.totals ?? {}) as Record<string, unknown>;

  return {
    totals: {
      skus: Number(t.skus ?? 0),
      skusInStock: Number(t.skusInStock ?? 0),
      totalUnits: Number(t.totalUnits ?? 0),
      totalValueUSD: Number(t.totalValueUSD ?? 0),
      rupture: Number(t.rupture ?? 0),
      risk: Number(t.risk ?? 0),
      excess: Number(t.excess ?? 0),
      noMovement: Number(t.noMovement ?? 0),
      normal: Number(t.normal ?? 0),
      skusMissingFromInventory: Number(t.skusMissingFromInventory ?? 0),
    },
    byCategory: ((r?.by_category ?? []) as Record<string, unknown>[]).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      skus: Number(c.skus),
      units: Number(c.units),
      valueUSD: Number(c.valueUSD),
      unitsSold: Number(c.unitsSold),
      revenueSold: Number(c.revenueSold),
    })),
    statuses: ((r?.statuses ?? []) as Record<string, unknown>[]).map((s) => ({
      key: s.key as StockStatus,
      count: Number(s.count),
      valueUSD: Number(s.valueUSD),
    })),
    coverage: ((r?.coverage ?? []) as Record<string, unknown>[]).map((c) => ({
      key: String(c.key),
      count: Number(c.count),
      valueUSD: Number(c.valueUSD),
    })),
    movers: lista(r?.movers),
    dormant: lista(r?.dormant),
    ruptureRisk: lista(r?.rupture_risk),
    belowMinimum: ((r?.below_minimum ?? []) as Record<string, unknown>[]).map((x) => ({
      productId: String(x.product_id),
      description: String(x.description ?? ""),
      manufacturerCode: String(x.manufacturer_code ?? ""),
      stock: Number(x.stock),
      minStock: Number(x.min_stock),
      status: x.status as StockStatus,
    })),
    rows: lista(r?.page),
    rowsTotal: Number(r?.rows_total ?? 0),
    periodDays,
    hasData: true,
  };
}

/**
 * Busca e situação da tabela. A busca cobre os mesmos quatro campos do filtro
 * antigo do navegador; `%` e `_` são escapados para não virarem curinga.
 */
function filtroTabela(o: OpcoesEstoque, p: Params): string {
  const cond: string[] = [];
  if (o.status !== "all") cond.push(`status = ${p.add(o.status)}`);
  const q = o.busca.trim();
  if (q) {
    const alvo = p.add(`%${q.replace(/([%_\\])/g, "\\$1").toLowerCase()}%`);
    cond.push(
      `(lower(description) LIKE ${alvo} OR lower(product_id) LIKE ${alvo}
        OR lower(manufacturer_code) LIKE ${alvo} OR lower(subgroup_name) LIKE ${alvo})`
    );
  }
  return cond.length ? cond.join(" AND ") : "true";
}
