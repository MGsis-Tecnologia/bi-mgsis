import type { PrismaClient } from "@prisma/client";
import type { OpcoesFiltro } from "@/lib/types/filtros";
import { consultaAnalitica } from "./base";

/**
 * Opções dos filtros globais — canal, subgrupo, vendedor e empresa.
 *
 * Antes eram derivadas no navegador, percorrendo o dataset inteiro do store
 * (`deriveChannels`/`deriveSubgroups`/`deriveSellers` em use-dataset, e
 * `useEmpresas`). Como a fase B tirou as telas do store, o bootstrap passou a
 * ser pulado nelas — e os dropdowns ficaram **vazios em todas as telas
 * migradas**, que é a maioria. Aqui elas voltam a ser preenchidas.
 *
 * **Não recebem filtros de propósito.** A lista é o universo do que existe nos
 * dados, não o que sobra depois do que já está selecionado: filtrar as opções
 * pelo filtro atual deixaria o usuário sem como voltar atrás — escolher um
 * vendedor esvaziaria a lista de vendedores.
 */


/**
 * Cache em memória, por tenant, invalidado pela versão dos datasets.
 *
 * Sem ele isto custaria ~1,7 s por carga de página: são varreduras completas de
 * `sale_items` e a união de `empresa_id` de seis tabelas. E é desperdício puro,
 * porque a lista **só muda quando alguém importa** — `dataset_meta.imported_at`
 * é exatamente esse carimbo, e lê-lo custa milissegundos.
 *
 * Uma varredura só, agrupando pela combinação (canal, subgrupo, vendedor), foi
 * medida e é PIOR: 2.054 ms contra 1.142 ms das três separadas, porque produz
 * 13.340 combinações distintas. É a mesma lição da seção 4.1 do PLANO-DADOS —
 * o Postgres paraleliza consultas independentes melhor que uma grande.
 */
const cache = new Map<string, { versao: string; opcoes: OpcoesFiltro }>();

async function versaoDatasets(db: PrismaClient): Promise<string> {
  const [row] = await db.$queryRawUnsafe<{ v: string | null }[]>(
    `SELECT string_agg(kind || ':' || imported_at, '|' ORDER BY kind) AS v FROM dataset_meta`
  );
  return row?.v ?? "vazio";
}

/**
 * `MIN(nome)` por id segue o mesmo critério dos demais módulos de análise. O
 * código antigo usava o nome da primeira linha do arquivo, o que dependia da
 * ordem de importação; para um dropdown, ordenar por nome é mais útil e é
 * reproduzível.
 *
 * Vazios ficam de fora: o `new Set` do código antigo deixava passar uma opção
 * em branco quando alguma linha vinha sem canal.
 */
export async function getOpcoesFiltro(db: PrismaClient, chave: string): Promise<OpcoesFiltro> {
  const versao = await versaoDatasets(db);
  const guardado = cache.get(chave);
  if (guardado?.versao === versao) return guardado.opcoes;

  // As seis tabelas que têm empresa_id. Uma empresa que só aparece em
  // orçamentos ou no caixa precisa estar na lista igual — o filtro é global.
  const TABELAS_COM_EMPRESA = [
    "sale_items",
    "receivable_items",
    "payable_items",
    "inventory_items",
    "caixa_items",
    "orcamento_items",
  ];

  const [canais, subgrupos, vendedores, empresas] = await Promise.all([
    consultaAnalitica<{ v: string }>(
      db,
      `SELECT channel AS v FROM sale_items
        WHERE order_type = 'VENDA' AND channel <> ''
        GROUP BY 1 ORDER BY 1`
    ),
    consultaAnalitica<{ id: string; name: string }>(
      db,
      `SELECT subgroup_id AS id, MIN(subgroup_name) AS name FROM sale_items
        WHERE order_type = 'VENDA' AND subgroup_id <> ''
        GROUP BY 1 ORDER BY 2, 1`
    ),
    consultaAnalitica<{ id: string; name: string }>(
      db,
      `SELECT seller_id AS id, MIN(seller_name) AS name FROM sale_items
        WHERE order_type = 'VENDA' AND seller_id <> ''
        GROUP BY 1 ORDER BY 2, 1`
    ),
    consultaAnalitica<{ v: string }>(
      db,
      `SELECT v FROM (${TABELAS_COM_EMPRESA.map(
        (t) => `SELECT empresa_id AS v FROM ${t} WHERE empresa_id <> '' GROUP BY 1`
      ).join(" UNION ")}) t
        -- Numérico quando dá, como fazia o sort do JS.
        ORDER BY NULLIF(regexp_replace(v, '\\D', '', 'g'), '')::bigint NULLS LAST, v`
    ),
  ]);

  const opcoes: OpcoesFiltro = {
    canais: canais.map((r) => r.v),
    subgrupos,
    vendedores,
    empresas: empresas.map((r) => r.v),
  };

  cache.set(chave, { versao, opcoes });
  return opcoes;
}
