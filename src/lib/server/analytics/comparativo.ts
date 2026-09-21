import type { PrismaClient } from "@prisma/client";
import {
  Params,
  consultaAnalitica,
  cteLinhas,
  exprTaxa,
  joinCambio,
  whereBase,
  type AnalyticsFilters,
} from "./base";

/**
 * Agregações do Comparativo Anual.
 *
 * Duas diferenças em relação às outras telas:
 *
 *  - **Não há filtro de período.** A comparação é ano a ano sobre todo o
 *    histórico; o seletor de datas não se aplica.
 *  - **Escopo BASE de filtros** (só empresa e moeda), porque a tela consome
 *    `ds.orders` e não a lista filtrada.
 *
 * Três consultas, uma por necessidade da tela:
 *
 *  - `getComparativoData` — os {@link TOP_N} maiores itens por receita, só para
 *    o GRÁFICO da visão geral.
 *  - `getComparativoLista` — TODOS os itens da dimensão, paginados, com busca e
 *    ordenação, para a tabela. Uma dimensão como produto ou cliente passa de
 *    milhares de itens; devolver tudo de uma vez não escala.
 *  - `getComparativoItem` — a série MENSAL de um item só, que alimenta o
 *    gráfico e a projeção depois do clique. Não vai junto com a lista porque
 *    são milhares de itens × ~55 meses.
 *
 * ## Fornecedor: venda atribuída pelo produto
 *
 * `sale_items` não sabe de quem a peça veio — o elo é o produto. A dimensão
 * `fornecedores` usa a MESMA regra da tela de Fornecedores ("comprado × vendido
 * por fornecedor"): cada produto fica com o fornecedor de quem MAIS se comprou
 * dele NO PERÍODO, e a venda do produto inteira vai para esse fornecedor. O
 * valor de cada ano continua sendo RECEITA DE VENDAS, como nas outras dimensões.
 *
 * A regra vale ANO A ANO: a coluna de 2026 usa quem mais se comprou em 2026, a
 * de 2025 usa 2025, e assim por diante — é o que a tela de Fornecedores mostra
 * com o filtro de período em "ano atual" ou no ano escolhido. Medir o "principal"
 * sobre o histórico inteiro atribuiria à coluna de 2026 vendas de produtos que
 * nem foram comprados em 2026, e o número deixaria de bater com a outra tela.
 * Consequência: o mesmo produto pode pertencer a fornecedores diferentes em
 * anos diferentes.
 *
 * Produto vendido num ano em que não teve compra registrada não tem fornecedor
 * naquele ano e fica de fora, exatamente como na tela de Fornecedores.
 *
 * A projeção do ano corrente NÃO é calculada aqui: ela depende de "hoje" e
 * continua no cliente, com `computeProjection`.
 */

export type Dimensao =
  | "vendedores" | "subgrupos" | "marcas" | "canais" | "clientes" | "produtos" | "fornecedores";

interface Config {
  key: string;
  label: string;
  /** Vendas ligadas ao fornecedor principal do produto (ver o topo do arquivo). */
  viaFornecedor?: true;
}

/**
 * Espelha os `keyFn`/`labelFn` do código antigo. Atenção ao subgrupo: ele é
 * chaveado pelo NOME, não pelo id — subgrupos homônimos se fundem, e mudar isso
 * alteraria os números. A marca, que é nova, já nasce chaveada pelo id.
 *
 * Todas as dimensões agregam por ITEM, inclusive vendedor, canal e cliente, que
 * no código antigo somavam o total do PEDIDO. Dá no mesmo, porque cada pedido
 * tem um único vendedor, canal e cliente (verificado nos 499.408 pedidos), e
 * evita o GROUP BY por pedido — que aqui, sem filtro de data, custa caro: a
 * série mensal medida caiu de 7.283 ms para 1.401 ms, com resultado idêntico.
 */
const DIMENSOES: Record<Dimensao, Config> = {
  vendedores: { key: "seller_id", label: "seller_name" },
  canais: { key: "channel", label: "channel" },
  clientes: { key: "client_id", label: "client_name" },
  subgrupos: { key: "subgroup_name", label: "subgroup_name" },
  // Chaveada pelo ID (marca_id), ao contrário do subgrupo: marcas homônimas
  // com ids diferentes ficam em linhas separadas. Vendas ainda sem marca —
  // período não reenviado depois de a view ganhar a coluna — têm id vazio e
  // caem juntas numa linha "Sem marca" em vez de sumirem do comparativo.
  marcas: { key: "brand_id", label: "COALESCE(NULLIF(brand_name, ''), 'Sem marca')" },
  produtos: { key: "product_id", label: "product_name" },
  // Pelo ID, como a tela de Fornecedores. Fornecedor sem nome cai em "Sem
  // fornecedor" em vez de ficar com o rótulo vazio.
  fornecedores: {
    key: "supplier_id",
    label: "COALESCE(NULLIF(supplier_name, ''), 'Sem fornecedor')",
    viaFornecedor: true,
  },
};

/** Itens do gráfico da visão geral. Mesma constante do código antigo (`topN`). */
const TOP_N = 15;

export interface LinhaAnual {
  key: string;
  label: string;
  /** Código do fabricante — só em produtos, e só quando o produto está no estoque. */
  mfr: string | null;
  byYear: Record<string, number>;
  total: number;
}

export interface ComparativoData {
  years: string[];
  /** Os {@link TOP_N} maiores por receita — o gráfico, não a tabela. */
  rows: LinhaAnual[];
  hasData: boolean;
}

export interface ListaComparativo {
  rows: LinhaAnual[];
  /** Itens que casam com a busca, somando todas as páginas. */
  total: number;
}

export interface ItemComparativo {
  key: string;
  label: string;
  mfr: string | null;
  byYear: Record<string, number>;
  /** "YYYY-MM" → receita. Entra na projeção, calculada no cliente. */
  byMonth: Record<string, number>;
  total: number;
}

export interface OpcoesLista {
  busca: string;
  /** "total" · "nome" · um ano "YYYY". */
  ordem: string;
  direcao: "asc" | "desc";
  offset: number;
  limite: number;
}

// Todo o histórico: a tela não tem filtro de período.
const PERIODO_TOTAL = { from: "0000-01-01", to: "9999-12-31" } as const;
const OPCOES_LINHAS = { escopoGraficos: false, ...PERIODO_TOTAL } as const;

const ANO = /^\d{4}$/;

/** `%` e `_` do texto digitado são literais, não curingas do LIKE. */
function escapaLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Empresa, moeda e tipo COMPRA — devolução e transferência distorceriam quem é o principal. */
function whereCompras(f: AnalyticsFilters, p: Params): string {
  const cond = ["c.pedido_tipo = 'COMPRA'"];
  if (f.empresaId !== "all") cond.push(`c.empresa_id = ${p.add(f.empresaId)}`);
  if (f.currency !== "ALL") cond.push(`c.moeda_id = ${p.add(f.currency)}`);
  return cond.join(" AND ");
}

/**
 * Vendas com o fornecedor principal de cada produto NO ANO DA VENDA, no formato
 * que o resto da consulta espera (`date`, `total` e a chave/rótulo da dimensão).
 *
 * Mesma regra de `vendaPorFornecedor` em fornecedores.ts, aplicada por ano:
 * compras convertidas por (ano, produto, fornecedor), `DISTINCT ON` pelo maior
 * valor de cada (ano, produto) — empate pelo menor id, para o resultado ser
 * estável — e a venda do produto inteira, naquele ano, vai para esse
 * fornecedor. O JOIN é interno de propósito: produto sem compra no ano não tem
 * fornecedor e não entra, como lá.
 */
function cteVendasPorFornecedor(f: AnalyticsFilters, p: Params): string {
  const compras = `
    SELECT substring(c.pedido_data, 1, 4) AS ano, c.produto_id, c.fornecedor_id,
           MIN(NULLIF(c.fornecedor_nome, '')) AS fornecedor_nome,
           SUM(c.produto_valor_total * ${exprTaxa(f)}) AS v
    FROM compra_items c
    ${joinCambio(f, p, "c.pedido_data", "c.moeda_id")}
    WHERE ${whereCompras(f, p)} AND c.pedido_data <> ''
    GROUP BY 1, c.produto_id, c.fornecedor_id`;

  return `
    SELECT v.date, v.total, v.product_id,
           pr.fornecedor_id AS supplier_id, pr.fornecedor_nome AS supplier_name
    FROM (${cteLinhas(f, p, OPCOES_LINHAS)}) v
    JOIN (
      SELECT DISTINCT ON (ano, produto_id) ano, produto_id, fornecedor_id, fornecedor_nome
      FROM (${compras}) cc
      ORDER BY ano, produto_id, v DESC, fornecedor_id
    ) pr ON pr.produto_id = v.product_id AND pr.ano = substring(v.date, 1, 4)`;
}

/** As linhas convertidas da dimensão: vendas, com ou sem o elo do fornecedor. */
function cteDaDimensao(f: AnalyticsFilters, p: Params, dimensao: Dimensao): string {
  return DIMENSOES[dimensao].viaFornecedor
    ? cteVendasPorFornecedor(f, p)
    : cteLinhas(f, p, OPCOES_LINHAS);
}

/**
 * Anos presentes na base. Saem direto da tabela: não há valor a converter, e
 * passar pela CTE de conversão custava 3.377 ms contra 1.197 ms medidos.
 *
 * São os anos de VENDA em todas as dimensões, inclusive fornecedor: as colunas
 * da tabela são as mesmas em qualquer aba.
 */
async function anosDaBase(db: PrismaClient, f: AnalyticsFilters): Promise<string[]> {
  const p = new Params();
  const sql = `SELECT DISTINCT substring(s.date, 1, 4) AS y
               FROM sale_items s WHERE ${whereBase(f, p)} ORDER BY 1`;
  const anos = await consultaAnalitica<{ y: string }>(db, sql, p.values);
  return anos.map((a) => a.y).filter((y) => ANO.test(y));
}

/**
 * Código do fabricante vem do dataset de ESTOQUE, não de vendas — o mesmo
 * critério da tela de Produtos. Só roda sobre as poucas linhas da página.
 */
async function codigosFabricante(
  db: PrismaClient,
  dimensao: Dimensao,
  chaves: string[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (dimensao !== "produtos" || chaves.length === 0) return mapa;

  const p = new Params();
  const lista = chaves.map((k) => p.add(k)).join(", ");
  const linhas = await db.$queryRawUnsafe<{ product_id: string; mfr: string }[]>(
    `SELECT product_id, MIN(manufacturer_code) AS mfr
     FROM inventory_items
     WHERE manufacturer_code <> '' AND product_id IN (${lista})
     GROUP BY product_id`,
    ...p.values
  );
  for (const l of linhas) mapa.set(l.product_id, l.mfr);
  return mapa;
}

/**
 * Uma página de itens da dimensão, já com a receita por ano de cada um.
 *
 * `por_ano` agrega uma vez por (item, ano) — no máximo itens × anos linhas — e
 * dela saem, na mesma varredura do histórico, o total, a ordenação por ano e o
 * JSON de receita por ano de cada item da página. É o que dispensa saber os
 * anos de antemão e evita uma segunda ida ao histórico.
 */
async function listaLinhas(
  db: PrismaClient,
  f: AnalyticsFilters,
  dimensao: Dimensao,
  o: OpcoesLista
): Promise<ListaComparativo> {
  const cfg = DIMENSOES[dimensao];
  const p = new Params();
  const linhas = cteDaDimensao(f, p, dimensao);

  const filtros: string[] = [];
  const busca = o.busca.trim();
  if (busca) {
    const like = p.add(`%${escapaLike(busca)}%`);
    const partes = [`${cfg.label} ILIKE ${like}`];
    if (dimensao === "produtos") {
      // Por código do produto e do fabricante também. Semi-join em vez de
      // EXISTS correlacionado: roda uma vez, não uma por linha de venda.
      partes.push(`product_id ILIKE ${like}`);
      partes.push(
        `product_id IN (SELECT product_id FROM inventory_items WHERE manufacturer_code ILIKE ${like})`
      );
    }
    filtros.push(`(${partes.join(" OR ")})`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

  // `ordem` chega validada pela rota, mas só o ano vai parametrizado; o resto é
  // escolha entre três nomes de coluna fixos.
  const porAno = ANO.test(o.ordem);
  const colunaOrdem = o.ordem === "nome" ? "label" : porAno ? "ord_ano" : "soma";
  const direcao = o.direcao === "asc" ? "ASC" : "DESC";
  const colOrdAno = porAno
    ? `, COALESCE(SUM(v) FILTER (WHERE y = ${p.add(o.ordem)}), 0) AS ord_ano`
    : "";

  const sql = `WITH l AS (${linhas}),
    por_ano AS (
      SELECT ${cfg.key} AS k, MIN(${cfg.label}) AS lbl,
             substring(date, 1, 4) AS y, SUM(total) AS v
      FROM l ${where}
      GROUP BY ${cfg.key}, substring(date, 1, 4)
    ),
    agg AS (
      SELECT k, MIN(lbl) AS label, SUM(v) AS soma${colOrdAno}
      FROM por_ano GROUP BY k
    )
    SELECT a.k AS key, a.label, a.soma,
           COUNT(*) OVER ()::int AS n,
           (SELECT json_object_agg(pa.y, pa.v) FROM por_ano pa WHERE pa.k = a.k) AS anos
    FROM agg a
    ORDER BY ${colunaOrdem} ${direcao}, a.k
    LIMIT ${p.add(o.limite)} OFFSET ${p.add(o.offset)}`;

  const rows = await consultaAnalitica<{
    key: string;
    label: string;
    soma: unknown;
    n: number;
    anos: Record<string, unknown> | null;
  }>(db, sql, p.values);

  const mfr = await codigosFabricante(db, dimensao, rows.map((r) => r.key));

  return {
    total: rows[0]?.n ?? 0,
    rows: rows.map((r) => {
      const byYear: Record<string, number> = {};
      for (const [ano, v] of Object.entries(r.anos ?? {})) byYear[ano] = Number(v);
      return {
        key: r.key,
        label: r.label,
        mfr: mfr.get(r.key) ?? null,
        byYear,
        total: Number(r.soma),
      };
    }),
  };
}

/** Os maiores itens por receita e os anos da base — o gráfico da visão geral. */
export async function getComparativoData(
  db: PrismaClient,
  f: AnalyticsFilters,
  dimensao: Dimensao
): Promise<ComparativoData> {
  const [anos, top] = await Promise.all([
    anosDaBase(db, f),
    listaLinhas(db, f, dimensao, {
      busca: "",
      ordem: "total",
      direcao: "desc",
      offset: 0,
      limite: TOP_N,
    }),
  ]);

  if (top.rows.length === 0) {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM sale_items WHERE order_type = 'VENDA') AS existe"
    );
    return { years: anos, rows: [], hasData: row?.existe ?? false };
  }

  return { years: anos, rows: top.rows, hasData: true };
}

/** Uma página da tabela: todos os itens da dimensão, com busca e ordenação. */
export async function getComparativoLista(
  db: PrismaClient,
  f: AnalyticsFilters,
  dimensao: Dimensao,
  o: OpcoesLista
): Promise<ListaComparativo> {
  return listaLinhas(db, f, dimensao, o);
}

/**
 * Um item só, com a série mensal. `null` quando a chave não tem venda — item
 * que sumiu da base entre a listagem e o clique, por exemplo.
 */
export async function getComparativoItem(
  db: PrismaClient,
  f: AnalyticsFilters,
  dimensao: Dimensao,
  chave: string
): Promise<ItemComparativo | null> {
  const cfg = DIMENSOES[dimensao];
  const p = new Params();
  // O filtro por chave fica fora da CTE de propósito: o Postgres a inlina, e o
  // predicado desce até a tabela, aproveitando os índices de produto, cliente
  // e vendedor.
  const sql = `WITH l AS (${cteDaDimensao(f, p, dimensao)})
    SELECT MIN(${cfg.label}) AS label, substring(date, 1, 7) AS mes, SUM(total) AS v
    FROM l WHERE ${cfg.key} = ${p.add(chave)}
    GROUP BY substring(date, 1, 7)`;

  const meses = await consultaAnalitica<{ label: string; mes: string; v: unknown }>(db, sql, p.values);
  if (meses.length === 0) return null;

  const byMonth: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  let total = 0;
  let label = meses[0]!.label;
  for (const m of meses) {
    const v = Number(m.v);
    byMonth[m.mes] = v;
    const ano = m.mes.slice(0, 4);
    byYear[ano] = (byYear[ano] ?? 0) + v;
    total += v;
    if (m.label < label) label = m.label;
  }

  const mfr = await codigosFabricante(db, dimensao, [chave]);
  return { key: chave, label, mfr: mfr.get(chave) ?? null, byYear, byMonth, total };
}
