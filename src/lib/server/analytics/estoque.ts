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
 * É a única que cruza tabelas grandes: o snapshot `inventory_items`
 * (111.970 linhas), o movimento de `sale_items` no período, e — só para a data
 * de última compra — `compra_items`. Mandar as linhas
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
 *
 * **A saída é líquida de devolução** (desde 21/09/2026): as linhas de
 * "DEVOLUCAO VENDA" do período são subtraídas das de "VENDA" por SKU — quantidade,
 * receita e custo —, com piso em zero (ver `e_dev`). As telas de Vendas e
 * Produtos continuam mostrando a devolução à parte.
 */

const RISK_DAYS = 15;
const EXCESS_DAYS = 180;
const DAYS_PER_MONTH = 30.44;

/**
 * As oito faixas de cobertura, na ordem "mais crítico primeiro" — mesma ordem
 * do donut e da legenda do cliente (`COVERAGE_ORDER` em
 * `src/lib/hooks/use-estoque-analytics.ts`). `test` recebe os NOMES das
 * colunas (não os valores) já qualificados pelo chamador, porque a mesma
 * lista alimenta duas CASE diferentes (texto da faixa e rank numérico) sobre
 * contextos SQL distintos — nunca a mesma coluna calculada duas vezes com
 * lógicas que podem divergir.
 */
const COVERAGE_BUCKETS: { key: string; test: (stock: string, demand: string, days: string) => string }[] = [
  { key: "sem_cobertura", test: (stock) => `${stock} <= 0` },
  { key: "fora_analise", test: (_s, demand, days) => `${demand} <= 0 OR ${days} IS NULL` },
  { key: "ate_1", test: (_s, _d, days) => `${days} / ${DAYS_PER_MONTH} <= 1` },
  { key: "1_2", test: (_s, _d, days) => `${days} / ${DAYS_PER_MONTH} <= 2` },
  { key: "2_4", test: (_s, _d, days) => `${days} / ${DAYS_PER_MONTH} <= 4` },
  { key: "4_6", test: (_s, _d, days) => `${days} / ${DAYS_PER_MONTH} <= 6` },
  { key: "6_12", test: (_s, _d, days) => `${days} / ${DAYS_PER_MONTH} <= 12` },
  { key: "mais_12", test: () => "true" },
];

/** CASE que devolve a CHAVE da faixa de cobertura ('sem_cobertura' ... 'mais_12'). */
function coverageBucketCase(stock: string, demand: string, days: string): string {
  const whens = COVERAGE_BUCKETS.slice(0, -1)
    .map((b) => `WHEN ${b.test(stock, demand, days)} THEN '${b.key}'`)
    .join("\n           ");
  return `CASE\n           ${whens}\n           ELSE '${COVERAGE_BUCKETS[COVERAGE_BUCKETS.length - 1].key}'\n         END`;
}

/**
 * CASE que devolve o RANK numérico (0-7) da mesma faixa, pra ordenar sem
 * depender de comparação de texto. Gerada da mesma lista que
 * `coverageBucketCase` — não pode reaproveitar o alias da outra CASE porque o
 * Postgres não permite referenciar um alias de coluna dentro do mesmo SELECT.
 */
function coverageBucketRankCase(stock: string, demand: string, days: string): string {
  const whens = COVERAGE_BUCKETS.slice(0, -1)
    .map((b, i) => `WHEN ${b.test(stock, demand, days)} THEN ${i}`)
    .join("\n           ");
  return `CASE\n           ${whens}\n           ELSE ${COVERAGE_BUCKETS.length - 1}\n         END`;
}

/**
 * As faixas de "há quanto tempo foi a última compra", no mesmo padrão das de
 * cobertura — mesmas cinco janelas (1/2/4/6/12 meses) — mais uma faixa própria
 * para quem nunca teve compra registrada. Existe para o filtro da tabela: quem
 * acabou de repor um item recém-comprado não precisa reexaminá-lo como Excesso
 * agora, e essa decisão é do usuário, não de um limiar fixo no código.
 */
const LAST_PURCHASE_BUCKETS: { key: string; test: (dias: string) => string }[] = [
  { key: "sem_compra", test: (dias) => `${dias} IS NULL` },
  { key: "ate_1", test: (dias) => `${dias} / ${DAYS_PER_MONTH} <= 1` },
  { key: "1_2", test: (dias) => `${dias} / ${DAYS_PER_MONTH} <= 2` },
  { key: "2_4", test: (dias) => `${dias} / ${DAYS_PER_MONTH} <= 4` },
  { key: "4_6", test: (dias) => `${dias} / ${DAYS_PER_MONTH} <= 6` },
  { key: "6_12", test: (dias) => `${dias} / ${DAYS_PER_MONTH} <= 12` },
  { key: "mais_12", test: () => "true" },
];

/** CASE que devolve a CHAVE da faixa de última compra ('sem_compra' ... 'mais_12'). */
function lastPurchaseBucketCase(dias: string): string {
  const whens = LAST_PURCHASE_BUCKETS.slice(0, -1)
    .map((b) => `WHEN ${b.test(dias)} THEN '${b.key}'`)
    .join("\n           ");
  return `CASE\n           ${whens}\n           ELSE '${LAST_PURCHASE_BUCKETS.at(-1)!.key}'\n         END`;
}

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
  /** "" = nenhuma compra registrada (fora do que o agente enviou, ou nunca comprado). */
  lastPurchaseDate: string;
  /** null = nunca vendido (o `Infinity` do código antigo não sobrevive a JSON). */
  coverageDays: number | null;
  avgDailyDemand: number;
  status: StockStatus;
  /** Mesma faixa do donut de cobertura ('sem_cobertura' ... 'mais_12'), agora por linha. */
  coverageBucket: string;
  /** Faixa de última compra ('sem_compra' ... 'mais_12') — ver LAST_PURCHASE_BUCKETS. */
  lastPurchaseBucket: string;
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
  /** Faixa de cobertura ('sem_cobertura' ... 'mais_12') ou 'all'. */
  coverageBucket: string;
  /** Faixa de última compra ('sem_compra' ... 'mais_12') ou 'all'. */
  lastPurchaseBucket: string;
  busca: string;
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

  // Devoluções do período, por produto, com os mesmos filtros da venda. Sem
  // isso o SKU com muita devolução tinha a saída inflada, a demanda também, e a
  // cobertura saía baixa demais — aparecia mais perto da ruptura do que estava,
  // justo o item sobre o qual alguém decidiria comprar de novo.
  //
  // O ERP manda quantidade e valor da devolução POSITIVOS (conferido no banco:
  // 27.948 linhas, nenhuma negativa), então eles são subtraídos em e_mov. Conta
  // pela data da devolução, não da venda original: é o movimento que aconteceu
  // na janela. O valor passa pelo mesmo câmbio da venda (mês da linha), senão
  // "Todas as moedas" subtrairia guarani de real.
  const pD = new Params();
  passos.push({
    nome: "e_dev",
    params: pD.values,
    sql: `SELECT s.product_id,
                 SUM(s.quantity) AS units_returned,
                 SUM(s.total_orig * ${exprTaxa(f)}) AS revenue_returned,
                 SUM(s.cost_orig  * ${exprTaxa(f)}) AS cost_returned
          FROM sale_items s ${joinCambio(f, pD, "s.date", "s.currency_id")}
          WHERE ${whereGraficos(f, pD, "DEVOLUCAO VENDA")}
            AND s.date >= ${pD.add(f.from)} AND s.date <= ${pD.add(f.to)}
          GROUP BY s.product_id`,
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
          -- Saída, receita e custo LÍQUIDOS de devolução, com piso em zero:
          -- devolução de venda feita antes da janela pode superar a venda
          -- dentro dela, e demanda ou receita negativa não têm significado
          -- nesta tela. (Vendas e Produtos seguem mostrando a devolução à parte.)
          SELECT ag.product_id,
                 GREATEST(ag.units_sold   - COALESCE(d.units_returned, 0), 0)   AS units_sold,
                 GREATEST(ag.revenue_sold - COALESCE(d.revenue_returned, 0), 0) AS revenue_sold,
                 GREATEST(ag.cost_sold    - COALESCE(d.cost_returned, 0), 0)    AS cost_sold,
                 ag.last_sale, ag.orders_count,
                 n.product_name, n.subgroup_id, n.subgroup_name
          FROM ag
          JOIN sale_items n ON n.id = ag.min_id
          LEFT JOIN e_dev d ON d.product_id = ag.product_id`,
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

  // Última compra de cada SKU — para a coluna "Última compra" e o filtro por
  // faixa. Só pedidos do tipo COMPRA (devolução e transferência não são
  // reposição). Sem filtro de moeda: é uma data, não um valor a converter.
  // Com "todas as empresas", o MAX cobre as duas — a mais recente vence, igual
  // ao resto do pipeline quando consolida por produto.
  const pCompra = new Params();
  const condCompra: string[] = ["pedido_tipo = 'COMPRA'"];
  if (f.empresaId !== "all") condCompra.push(`empresa_id = ${pCompra.add(f.empresaId)}`);
  passos.push({
    nome: "e_compra",
    params: pCompra.values,
    sql: `SELECT produto_id AS product_id, MAX(pedido_data) AS ultima_compra
          FROM compra_items
          WHERE ${condCompra.join(" AND ")}
          GROUP BY produto_id`,
  });

  const pFin = new Params();
  const diasFin = pFin.add(periodDays);
  const diasFin2 = pFin.add(periodDays);
  // Dias desde a última compra são contados contra HOJE (o relógio do
  // cliente), não contra o fim do período filtrado — "recém-comprado" é uma
  // pergunta sobre agora, não sobre o recorte de datas em análise.
  const hojeCompra = pFin.add(o.hoje);
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
           COALESCE(ec.ultima_compra, '') AS last_purchase_date,
           -- ord reproduz a ordem de inserção do array antigo: o snapshot
           -- primeiro (na ordem da tabela), depois os SKUs ausentes dele. Os
           -- sort do JS são estáveis, então é isso que desempatava antes.
           true AS has_inventory, inv.id AS ord
    FROM e_inv inv
    LEFT JOIN e_mov mov ON mov.product_id = inv.product_id
    LEFT JOIN e_cat cat ON cat.product_id = inv.product_id
    LEFT JOIN e_compra ec ON ec.product_id = inv.product_id

    UNION ALL

    -- Vendeu no período e não está no snapshot: ruptura com estoque 0.
    SELECT mov.product_id,
           TRIM(COALESCE(NULLIF(mov.product_name, ''), NULLIF(cat.product_name, ''), '')) AS description,
           '' AS manufacturer_code, mov.subgroup_id, mov.subgroup_name,
           0 AS stock, 0 AS min_stock, 0 AS cost_total,
           mov.units_sold, mov.revenue_sold, mov.cost_sold, mov.orders_count,
           COALESCE(mov.last_sale, '') AS last_sale_date,
           COALESCE(ec.ultima_compra, '') AS last_purchase_date,
           false AS has_inventory,
           2000000000 + row_number() OVER (ORDER BY mov.product_id) AS ord
    FROM e_mov mov
    LEFT JOIN e_cat cat ON cat.product_id = mov.product_id
    LEFT JOIN e_compra ec ON ec.product_id = mov.product_id
    WHERE NOT EXISTS (SELECT 1 FROM e_inv inv WHERE inv.product_id = mov.product_id)
      -- Venda inteira devolvida no período não é "vendeu": sem isso o SKU
      -- viraria ruptura com saída zero.
      AND mov.units_sold > 0
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
           CASE WHEN b.stock > 0 THEN b.cost_total / b.stock ELSE 0 END AS unit_cost,
           CASE WHEN b.last_purchase_date <> ''
                THEN (${hojeCompra}::date - b.last_purchase_date::date)
           END AS dias_desde_compra
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
         END AS status,
         ${coverageBucketCase("c.stock", "c.avg_daily_demand", "c.coverage_days")} AS coverage_bucket,
         ${coverageBucketRankCase("c.stock", "c.avg_daily_demand", "c.coverage_days")} AS bucket_rank,
         ${lastPurchaseBucketCase("c.dias_desde_compra")} AS last_purchase_bucket
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
      SELECT coverage_bucket AS key,
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

    -- Sem LIMIT: a tabela de detalhamento lista o conjunto inteiro filtrado —
    -- a rolagem virtualizada do lado do cliente é quem cuida de não travar o
    -- navegador (ver src/app/(dashboard)/estoque/page.tsx). Ordem padrão:
    -- cobertura DECRESCENTE primeiro (maior cobertura no topo), custo total
    -- decrescente como desempate — NULLS LAST porque "sem cobertura calculada"
    -- (estoque zerado ou nunca vendido) não é "cobertura alta", é ausência de
    -- dado, então vai para o fim, não para o topo do DESC.
    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
      SELECT * FROM e_fin WHERE ${filtroTabela(o, pFim)}
      ORDER BY coverage_days DESC NULLS LAST, cost_total DESC, ord) t) AS page`;

  const r = await db.$transaction(
    async (tx) => {
      // O que falta ao planejador é a cardinalidade, não histograma fino: com o
      // alvo padrão (100) o ANALYZE das temporárias custava 2,5 s. Com 10
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
    lastPurchaseDate: String(x.last_purchase_date ?? ""),
    coverageDays: x.coverage_days === null || x.coverage_days === undefined
      ? null
      : Number(x.coverage_days),
    avgDailyDemand: Number(x.avg_daily_demand),
    status: x.status as StockStatus,
    coverageBucket: String(x.coverage_bucket),
    lastPurchaseBucket: String(x.last_purchase_bucket ?? "sem_compra"),
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
 * Busca, situação e faixa de cobertura da tabela. A busca cobre os mesmos
 * quatro campos do filtro antigo do navegador; `%` e `_` são escapados para
 * não virarem curinga.
 */
function filtroTabela(o: OpcoesEstoque, p: Params): string {
  const cond: string[] = [];
  if (o.status !== "all") cond.push(`status = ${p.add(o.status)}`);
  if (o.coverageBucket !== "all") cond.push(`coverage_bucket = ${p.add(o.coverageBucket)}`);
  if (o.lastPurchaseBucket !== "all") cond.push(`last_purchase_bucket = ${p.add(o.lastPurchaseBucket)}`);
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
