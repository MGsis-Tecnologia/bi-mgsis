import type { PrismaClient } from "@prisma/client";
import {
  Params,
  consultaAnalitica,
  exprTaxa,
  joinCambio,
  type AnalyticsFilters,
} from "./base";

/**
 * Agregações da tela de Fornecedores.
 *
 * Sai da MESMA tabela de Compras (`compra_items`), que é onde estão fornecedor,
 * produto, subgrupo e as duas datas. Não há tabela de cadastro de fornecedor:
 * quem é fornecedor é quem aparece numa compra, e o nome vem da própria linha.
 *
 * ## As duas datas, e qual manda
 *
 *  - `pedido_data`   — quando a mercadoria CHEGOU. É a data do gasto, e é ela
 *                      que define o período de tudo nesta tela (e na ingestão).
 *  - `pedido_emissao`— quando o pedido foi emitido pelo fornecedor. Só entra no
 *                      prazo de entrega, que é a diferença entre as duas.
 *
 * Trocar as duas mudaria todo valor de lugar no tempo sem gerar erro nenhum,
 * então a escolha está dita aqui e repetida no SQL.
 *
 * ## Curva ABC
 *
 * Acumulado até 80% = A, até 95% = B, o resto = C. Vale para fornecedores e
 * para produtos, e é o mesmo corte nos dois para a matriz cruzada fazer sentido.
 *
 * ## O cruzamento com vendas
 *
 * `sale_items` não tem fornecedor — o vínculo é o produto. Cada produto é
 * atribuído ao fornecedor de quem MAIS se comprou dele no período (regra dita
 * na tela). Um produto comprado de dois fornecedores conta inteiro para o
 * maior, e não é rateado: rateio exigiria uma regra de proporção que ninguém
 * pediu, e a leitura ("quanto vendi do que este fornecedor me traz") continua
 * honesta com a atribuição principal.
 */

export type Curva = "A" | "B" | "C";

export interface FornecedorMetrica {
  id: string;
  nome: string;
  pedidos: number;
  itens: number;
  valor: number;
  ticketMedio: number;
  ultimaCompra: string;
  share: number;
  shareAcumulado: number;
  curva: Curva;
  /** Média de dias entre emissão e chegada. `null` quando não há emissão. */
  prazoDias: number | null;
  /** true = primeira compra deste fornecedor caiu dentro do período. */
  novo: boolean;
}

export interface CategoriaCompra {
  subgrupoId: string;
  subgrupo: string;
  valor: number;
  share: number;
  fornecedores: number;
}

export interface PontoPeriodo {
  key: string;
  valor: number;
  pedidos: number;
}

export interface CelulaAbc {
  produto: Curva;
  fornecedor: Curva;
  produtos: number;
  valor: number;
}

export interface VendaPorFornecedor {
  id: string;
  nome: string;
  comprado: number;
  vendido: number;
  produtos: number;
}

export interface FornecedoresKpis {
  totalComprado: number;
  pedidos: number;
  fornecedores: number;
  ticketMedio: number;
  /** Participação acumulada do maior, dos 2 maiores e dos 5 maiores. */
  shareTop1: number;
  shareTop2: number;
  shareTop5: number;
  /** Herfindahl–Hirschman: soma dos quadrados das participações (0 a 1). */
  hhi: number;
  novos: number;
  recorrentes: number;
  valorNovos: number;
  prazoMedioDias: number | null;
}

export interface FornecedoresData {
  kpis: FornecedoresKpis;
  /** Série mensal do período filtrado. Trimestre e ano saem daqui no cliente. */
  mensal: PontoPeriodo[];
  /** Mesma janela, 12 meses antes — o comparativo ano a ano. */
  mensalAnterior: PontoPeriodo[];
  fornecedores: FornecedorMetrica[];
  categorias: CategoriaCompra[];
  matrizAbc: CelulaAbc[];
  vendaPorFornecedor: VendaPorFornecedor[];
  hasData: boolean;
}

/** Quantos fornecedores a tabela e o gráfico de participação trazem. */
export const TOP_FORNECEDORES = 100;
/** Fatias do gráfico de participação antes de tudo virar "Demais". */
export const FATIAS_PARTICIPACAO = 8;

export const FORNECEDORES_VAZIO: FornecedoresData = {
  kpis: {
    totalComprado: 0, pedidos: 0, fornecedores: 0, ticketMedio: 0,
    shareTop1: 0, shareTop2: 0, shareTop5: 0, hhi: 0,
    novos: 0, recorrentes: 0, valorNovos: 0, prazoMedioDias: null,
  },
  mensal: [], mensalAnterior: [], fornecedores: [], categorias: [],
  matrizAbc: [], vendaPorFornecedor: [], hasData: false,
};

/**
 * Empresa, moeda, subgrupo e o tipo do documento.
 *
 * `pedido_tipo = 'COMPRA'` deixa de fora devolução e transferência: somá-las ao
 * gasto infla o total, e a tela é sobre o que se comprou.
 *
 * O subgrupo entra porque `compra_items` passou a ter a coluna — assim o filtro
 * global de categoria vale aqui como vale em Vendas.
 */
function whereCompras(f: AnalyticsFilters, p: Params, alias = "c"): string {
  const cond = [`${alias}.pedido_tipo = 'COMPRA'`];
  if (f.empresaId !== "all") cond.push(`${alias}.empresa_id = ${p.add(f.empresaId)}`);
  if (f.currency !== "ALL") cond.push(`${alias}.moeda_id = ${p.add(f.currency)}`);
  if (f.subgroupId !== "all") cond.push(`${alias}.subgrupo_id = ${p.add(f.subgroupId)}`);
  return cond.join(" AND ");
}

/** Período sobre a data de CHEGADA. */
function noPeriodo(f: Params, de: string, ate: string, alias = "c"): string {
  return `${alias}.pedido_data >= ${f.add(de)} AND ${alias}.pedido_data <= ${f.add(ate)}`;
}

/** Um ano para trás, mantendo o dia. Fevereiro 29 vira 28 — o Postgres resolve. */
function anoAnterior(d: string): string {
  const [a, m, dia] = d.split("-").map(Number);
  const anterior = new Date(Date.UTC(a! - 1, m! - 1, dia!));
  return anterior.toISOString().slice(0, 10);
}

const curvaDe = (acumulado: number): Curva =>
  acumulado <= 0.8 ? "A" : acumulado <= 0.95 ? "B" : "C";

export async function getFornecedoresData(
  db: PrismaClient,
  f: AnalyticsFilters
): Promise<FornecedoresData> {
  const taxa = exprTaxa(f);
  const valor = `c.produto_valor_total * ${taxa}`;

  /** Série por mês de uma janela qualquer — serve ao período e ao ano anterior. */
  const serie = async (de: string, ate: string): Promise<PontoPeriodo[]> => {
    const p = new Params();
    const sql = `
      SELECT substring(c.pedido_data, 1, 7) AS key,
             COALESCE(SUM(${valor}), 0) AS valor,
             COUNT(DISTINCT c.pedido_documento)::int AS pedidos
      FROM compra_items c
      ${joinCambio(f, p, "c.pedido_data", "c.moeda_id")}
      WHERE ${whereCompras(f, p)} AND ${noPeriodo(p, de, ate)}
      GROUP BY 1 ORDER BY 1`;
    const rows = await consultaAnalitica<{ key: string; valor: unknown; pedidos: number }>(
      db, sql, p.values
    );
    return rows.map((r) => ({ key: r.key, valor: Number(r.valor), pedidos: r.pedidos }));
  };

  /**
   * Ranking de fornecedores, já com curva, prazo e a marca de novo.
   *
   * "Novo" = não existe compra dele ANTES do início do período. É por isso que
   * a subconsulta não repete o recorte de período: ela olha justamente o que
   * ficou fora dele.
   */
  const fornecedores = async (): Promise<FornecedorMetrica[]> => {
    const p = new Params();
    const sql = `
      WITH base AS (
        SELECT c.fornecedor_id AS id,
               MIN(NULLIF(c.fornecedor_nome, '')) AS nome,
               COUNT(DISTINCT c.pedido_documento)::int AS pedidos,
               COUNT(*)::int AS itens,
               COALESCE(SUM(${valor}), 0) AS valor,
               MAX(c.pedido_data) AS ultima,
               -- Só as linhas que têm as duas datas entram no prazo.
               AVG(c.pedido_data::date - c.pedido_emissao::date)
                 FILTER (WHERE c.pedido_emissao <> '' AND c.pedido_data >= c.pedido_emissao)
                 AS prazo
        FROM compra_items c
        ${joinCambio(f, p, "c.pedido_data", "c.moeda_id")}
        WHERE ${whereCompras(f, p)} AND ${noPeriodo(p, f.from, f.to)}
        GROUP BY 1
      ),
      antes AS (
        SELECT DISTINCT a.fornecedor_id AS id
        FROM compra_items a
        WHERE a.pedido_tipo = 'COMPRA' AND a.pedido_data <> ''
          AND a.pedido_data < ${p.add(f.from)}
      )
      SELECT b.id, b.nome, b.pedidos, b.itens, b.valor, b.ultima, b.prazo,
             (antes.id IS NULL) AS novo
      FROM base b LEFT JOIN antes ON antes.id = b.id
      ORDER BY b.valor DESC, b.id
      LIMIT ${TOP_FORNECEDORES}`;

    const rows = await consultaAnalitica<{
      id: string; nome: string | null; pedidos: number; itens: number;
      valor: unknown; ultima: string; prazo: unknown; novo: boolean;
    }>(db, sql, p.values);

    // Share e curva saem do total GERAL (vem dos KPIs), não da soma do top N —
    // senão o acumulado fecharia em 100% ignorando a cauda.
    return rows.map((r) => ({
      id: r.id,
      nome: r.nome ?? "—",
      pedidos: r.pedidos,
      itens: r.itens,
      valor: Number(r.valor),
      ticketMedio: r.pedidos > 0 ? Number(r.valor) / r.pedidos : 0,
      ultimaCompra: r.ultima ?? "",
      share: 0,
      shareAcumulado: 0,
      curva: "C" as Curva,
      prazoDias: r.prazo === null ? null : Math.round(Number(r.prazo) * 10) / 10,
      novo: r.novo,
    }));
  };

  /** KPIs de volume e de concentração, sobre TODOS os fornecedores. */
  const kpis = async (): Promise<FornecedoresKpis> => {
    const p = new Params();
    const sql = `
      WITH por_forn AS (
        SELECT c.fornecedor_id AS id,
               COALESCE(SUM(${valor}), 0) AS valor,
               MIN(c.pedido_data) AS primeira
        FROM compra_items c
        ${joinCambio(f, p, "c.pedido_data", "c.moeda_id")}
        WHERE ${whereCompras(f, p)} AND ${noPeriodo(p, f.from, f.to)}
        GROUP BY 1
      ),
      antes AS (
        SELECT DISTINCT a.fornecedor_id AS id
        FROM compra_items a
        WHERE a.pedido_tipo = 'COMPRA' AND a.pedido_data <> ''
          AND a.pedido_data < ${p.add(f.from)}
      ),
      classificado AS (
        SELECT pf.id, pf.valor, (antes.id IS NULL) AS novo,
               ROW_NUMBER() OVER (ORDER BY pf.valor DESC, pf.id) AS pos
        FROM por_forn pf LEFT JOIN antes ON antes.id = pf.id
      ),
      totais AS (
        SELECT COALESCE(SUM(valor), 0) AS total, COUNT(*)::int AS n FROM classificado
      ),
      geral AS (
        SELECT COUNT(DISTINCT c.pedido_documento)::int AS pedidos,
               AVG(c.pedido_data::date - c.pedido_emissao::date)
                 FILTER (WHERE c.pedido_emissao <> '' AND c.pedido_data >= c.pedido_emissao)
                 AS prazo
        FROM compra_items c
        WHERE ${whereCompras(f, p)} AND ${noPeriodo(p, f.from, f.to)}
      )
      SELECT t.total, t.n AS fornecedores, g.pedidos, g.prazo,
             COALESCE(SUM(cl.valor) FILTER (WHERE cl.pos <= 1), 0) AS top1,
             COALESCE(SUM(cl.valor) FILTER (WHERE cl.pos <= 2), 0) AS top2,
             COALESCE(SUM(cl.valor) FILTER (WHERE cl.pos <= 5), 0) AS top5,
             COUNT(*) FILTER (WHERE cl.novo)::int AS novos,
             COALESCE(SUM(cl.valor) FILTER (WHERE cl.novo), 0) AS valor_novos,
             -- HHI: soma dos quadrados das participações. 1 = um fornecedor só.
             COALESCE(SUM(POWER(cl.valor / NULLIF(t.total, 0), 2)), 0) AS hhi
      FROM classificado cl, totais t, geral g
      GROUP BY t.total, t.n, g.pedidos, g.prazo`;

    const [r] = await consultaAnalitica<{
      total: unknown; fornecedores: number; pedidos: number; prazo: unknown;
      top1: unknown; top2: unknown; top5: unknown;
      novos: number; valor_novos: unknown; hhi: unknown;
    }>(db, sql, p.values);

    const total = Number(r?.total ?? 0);
    const pct = (v: unknown) => (total > 0 ? Number(v ?? 0) / total : 0);
    const fornecedores = r?.fornecedores ?? 0;
    return {
      totalComprado: total,
      pedidos: r?.pedidos ?? 0,
      fornecedores,
      ticketMedio: (r?.pedidos ?? 0) > 0 ? total / r!.pedidos : 0,
      shareTop1: pct(r?.top1),
      shareTop2: pct(r?.top2),
      shareTop5: pct(r?.top5),
      hhi: Number(r?.hhi ?? 0),
      novos: r?.novos ?? 0,
      recorrentes: fornecedores - (r?.novos ?? 0),
      valorNovos: Number(r?.valor_novos ?? 0),
      prazoMedioDias: r?.prazo == null ? null : Math.round(Number(r.prazo) * 10) / 10,
    };
  };

  /** Gasto por categoria (subgrupo do produto comprado). */
  const categorias = async (): Promise<CategoriaCompra[]> => {
    const p = new Params();
    const sql = `
      SELECT COALESCE(NULLIF(c.subgrupo_id, ''), '—') AS id,
             COALESCE(MIN(NULLIF(c.subgrupo_descricao, '')), 'Sem categoria') AS nome,
             COALESCE(SUM(${valor}), 0) AS valor,
             COUNT(DISTINCT c.fornecedor_id)::int AS fornecedores
      FROM compra_items c
      ${joinCambio(f, p, "c.pedido_data", "c.moeda_id")}
      WHERE ${whereCompras(f, p)} AND ${noPeriodo(p, f.from, f.to)}
      GROUP BY 1 ORDER BY 3 DESC LIMIT 40`;
    const rows = await consultaAnalitica<{
      id: string; nome: string; valor: unknown; fornecedores: number;
    }>(db, sql, p.values);
    const total = rows.reduce((s, r) => s + Number(r.valor), 0);
    return rows.map((r) => ({
      subgrupoId: r.id,
      subgrupo: r.nome,
      valor: Number(r.valor),
      share: total > 0 ? Number(r.valor) / total : 0,
      fornecedores: r.fornecedores,
    }));
  };

  /**
   * Matriz ABC: cada PRODUTO tem sua curva e cada FORNECEDOR a dele; a célula
   * cruza as duas. Um produto A comprado de um fornecedor C é o caso que a
   * matriz existe para mostrar — item que pesa, comprado de quem não pesa.
   */
  const matrizAbc = async (): Promise<CelulaAbc[]> => {
    const p = new Params();
    const sql = `
      WITH linhas AS (
        SELECT c.produto_id, c.fornecedor_id, ${valor} AS v
        FROM compra_items c
        ${joinCambio(f, p, "c.pedido_data", "c.moeda_id")}
        WHERE ${whereCompras(f, p)} AND ${noPeriodo(p, f.from, f.to)}
      ),
      prod AS (
        SELECT produto_id, SUM(v) AS v FROM linhas GROUP BY 1
      ),
      prod_curva AS (
        SELECT produto_id,
               CASE WHEN SUM(v) OVER (ORDER BY v DESC, produto_id) / NULLIF(SUM(v) OVER (), 0) <= 0.8 THEN 'A'
                    WHEN SUM(v) OVER (ORDER BY v DESC, produto_id) / NULLIF(SUM(v) OVER (), 0) <= 0.95 THEN 'B'
                    ELSE 'C' END AS curva
        FROM prod
      ),
      forn AS (
        SELECT fornecedor_id, SUM(v) AS v FROM linhas GROUP BY 1
      ),
      forn_curva AS (
        SELECT fornecedor_id,
               CASE WHEN SUM(v) OVER (ORDER BY v DESC, fornecedor_id) / NULLIF(SUM(v) OVER (), 0) <= 0.8 THEN 'A'
                    WHEN SUM(v) OVER (ORDER BY v DESC, fornecedor_id) / NULLIF(SUM(v) OVER (), 0) <= 0.95 THEN 'B'
                    ELSE 'C' END AS curva
        FROM forn
      )
      SELECT pc.curva AS produto, fc.curva AS fornecedor,
             COUNT(DISTINCT l.produto_id)::int AS produtos,
             COALESCE(SUM(l.v), 0) AS valor
      FROM linhas l
        JOIN prod_curva pc ON pc.produto_id = l.produto_id
        JOIN forn_curva fc ON fc.fornecedor_id = l.fornecedor_id
      GROUP BY 1, 2`;
    const rows = await consultaAnalitica<{
      produto: Curva; fornecedor: Curva; produtos: number; valor: unknown;
    }>(db, sql, p.values);
    return rows.map((r) => ({
      produto: r.produto,
      fornecedor: r.fornecedor,
      produtos: r.produtos,
      valor: Number(r.valor),
    }));
  };

  /**
   * Comprado × vendido por fornecedor.
   *
   * O elo é o produto: `sale_items` não sabe de quem a peça veio. Cada produto
   * fica com o fornecedor de quem mais se comprou dele no período — a venda
   * daquele produto inteira vai para esse fornecedor.
   *
   * Os dois lados convertem pela cotação do DIA DE CADA LINHA, cada um em sua
   * própria subconsulta: são datas diferentes, e o mesmo alias de câmbio não
   * caberia duas vezes no mesmo escopo.
   */
  const vendaPorFornecedor = async (): Promise<VendaPorFornecedor[]> => {
    // Um acumulador só para os dois blocos: os `$n` são posicionais, então a
    // ordem em que os trechos são MONTADOS tem que ser a mesma em que aparecem
    // no SQL final — compras primeiro, vendas depois.
    const p = new Params();
    const compras = `
      SELECT c.produto_id, c.fornecedor_id, c.fornecedor_nome, SUM(${valor}) AS v
      FROM compra_items c
      ${joinCambio(f, p, "c.pedido_data", "c.moeda_id")}
      WHERE ${whereCompras(f, p)} AND ${noPeriodo(p, f.from, f.to)}
      GROUP BY 1, 2, 3`;

    // Continua no MESMO acumulador para os números de parâmetro seguirem.
    const vendas = `
      SELECT s.product_id, SUM(s.total_orig * ${taxa}) AS v
      FROM sale_items s
      ${joinCambio(f, p, "s.date", "s.currency_id")}
      WHERE s.order_type = 'VENDA'
        ${f.empresaId !== "all" ? `AND s.empresa_id = ${p.add(f.empresaId)}` : ""}
        ${f.currency !== "ALL" ? `AND s.currency_id = ${p.add(f.currency)}` : ""}
        AND s.date >= ${p.add(f.from)} AND s.date <= ${p.add(f.to)}
      GROUP BY 1`;

    const sql = `
      WITH compras AS (${compras}),
      principal AS (
        SELECT DISTINCT ON (produto_id) produto_id, fornecedor_id, fornecedor_nome
        FROM compras ORDER BY produto_id, v DESC, fornecedor_id
      ),
      comprado AS (
        SELECT fornecedor_id, SUM(v) AS v FROM compras GROUP BY 1
      ),
      vendas AS (${vendas})
      SELECT c.fornecedor_id AS id,
             COALESCE(MIN(NULLIF(pr.fornecedor_nome, '')), '—') AS nome,
             MIN(c.v) AS comprado,
             -- Produtos em que ESTE fornecedor é o principal: é esse o conjunto
             -- cuja venda é somada ao lado, então contar outro seria comparar
             -- coisas diferentes na mesma linha.
             COUNT(DISTINCT pr.produto_id)::int AS produtos,
             COALESCE(SUM(v.v), 0) AS vendido
      FROM comprado c
        LEFT JOIN principal pr ON pr.fornecedor_id = c.fornecedor_id
        LEFT JOIN vendas v ON v.product_id = pr.produto_id
      GROUP BY 1
      ORDER BY 3 DESC
      LIMIT 25`;

    const rows = await consultaAnalitica<{
      id: string; nome: string; comprado: unknown; produtos: number; vendido: unknown;
    }>(db, sql, p.values);
    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      comprado: Number(r.comprado),
      vendido: Number(r.vendido),
      produtos: r.produtos,
    }));
  };

  const [k, mensal, mensalAnterior, lista, cats, matriz, vendas] = await Promise.all([
    kpis(),
    serie(f.from, f.to),
    serie(anoAnterior(f.from), anoAnterior(f.to)),
    fornecedores(),
    categorias(),
    matrizAbc(),
    vendaPorFornecedor(),
  ]);

  // Share e curva dependem do total geral, que só o KPI conhece.
  let acumulado = 0;
  const comCurva = lista.map((forn) => {
    const share = k.totalComprado > 0 ? forn.valor / k.totalComprado : 0;
    acumulado += share;
    return { ...forn, share, shareAcumulado: acumulado, curva: curvaDe(acumulado) };
  });

  return {
    kpis: k,
    mensal,
    mensalAnterior,
    fornecedores: comCurva,
    categorias: cats,
    matrizAbc: matriz,
    vendaPorFornecedor: vendas,
    hasData: k.fornecedores > 0,
  };
}

export type { AnalyticsFilters };
