import { z } from "zod";

/**
 * Contrato da ingestão por API (fase D do PLANO-DADOS).
 *
 * Uma operação só: **"substitua o período X por estas linhas"**. Não há
 * `UPDATE` nem `UPSERT` porque não existe chave única de linha — o mesmo
 * pedido + produto pode repetir legitimamente na mesma venda. Substituir um
 * conjunto inteiro é a única semântica correta, e dá idempotência de graça:
 * reenviar o mesmo período duas vezes leva ao mesmo resultado.
 *
 * O período é sempre pela **data de emissão**, decisão do negócio. Em Contas a
 * Receber/Pagar isso é `issue_date`, e não o vencimento — a tela filtra por
 * vencimento, mas quem define a que mês a linha PERTENCE é a emissão.
 */

const texto = z.string().max(255);
/** Campo textual opcional: ausente vira "", que é o default de todas as colunas. */
const textoOpc = texto.optional().default("");
const numero = z.coerce.number().finite();
const numeroOpc = numero.optional().default(0);
const boolOpc = z.coerce.boolean().optional().default(false);

/**
 * Data ISO. Recusa o que o banco hoje aceita calado: a coluna é TEXT, então
 * `2202-09-05` (digitação de 2022) entrava e sujava relatório sem sinal algum.
 */
const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD")
  .refine((d) => {
    const t = Date.parse(d + "T00:00:00Z");
    if (Number.isNaN(t)) return false;
    // Recusa 2024-02-31 e afins: o Date normaliza em silêncio, então compara de volta.
    return new Date(t).toISOString().slice(0, 10) === d;
  }, "data inexistente no calendário")
  .refine((d) => d >= "1990-01-01" && d <= "2035-12-31", "data fora de 1990–2035");

const dataOpc = z.union([dataISO, z.literal("")]).optional().default("");

// ─── Linhas por dataset ──────────────────────────────────────────────────────

const linhaVenda = z.object({
  date: dataISO,
  orderId: texto,
  orderType: textoOpc,
  channel: textoOpc,
  clientId: textoOpc,
  clientName: textoOpc,
  clientCity: textoOpc,
  productId: textoOpc,
  productName: textoOpc,
  quantity: numeroOpc,
  totalOrig: numeroOpc,
  costOrig: numeroOpc,
  discountOrig: numeroOpc,
  subgroupId: textoOpc,
  subgroupName: textoOpc,
  sellerId: textoOpc,
  sellerName: textoOpc,
  currencyId: textoOpc,
  currencyCode: textoOpc,
  empresaId: textoOpc,
});

const linhaOrcamento = z.object({
  orcamentoId: texto,
  orcamentoData: dataISO,
  orcamentoConfirmado: boolOpc,
  orcamentoDataConfirmacao: dataOpc,
  clienteId: textoOpc,
  clienteNome: textoOpc,
  vendedorId: textoOpc,
  vendedorNome: textoOpc,
  empresaId: textoOpc,
  moedaId: textoOpc,
  moedaSigla: textoOpc,
  itemOrcamentoId: textoOpc,
  produtoId: textoOpc,
  produtoDescricao: textoOpc,
  produtoFabricante: textoOpc,
  itemQuantidade: numeroOpc,
  itemQuantidadeConfirmada: numeroOpc,
  itemTotal: numeroOpc,
});

const linhaReceber = z.object({
  documentId: texto,
  clientId: textoOpc,
  clientName: textoOpc,
  clientCity: textoOpc,
  issueDate: dataISO,
  dueDate: dataOpc,
  receivedDate: dataOpc,
  isPaid: boolOpc,
  entryType: textoOpc,
  amountOrig: numeroOpc,
  sellerId: textoOpc,
  sellerName: textoOpc,
  currencyId: textoOpc,
  currencyCode: textoOpc,
  empresaId: textoOpc,
});

const linhaPagar = z.object({
  documentId: texto,
  supplierId: textoOpc,
  supplierName: textoOpc,
  issueDate: dataISO,
  dueDate: dataOpc,
  paidDate: dataOpc,
  isPaid: boolOpc,
  entryType: textoOpc,
  amountOrig: numeroOpc,
  currencyId: textoOpc,
  currencyCode: textoOpc,
  empresaId: textoOpc,
});

// Compras: nomes em português porque a tabela `compra_items` também está —
// ela espelha a view `bi_compras`, e traduzir no meio do caminho só criaria
// mais um dicionário para consultar. Ver o model CompraItem.
const linhaCompra = z.object({
  pedidoData: dataISO,
  pedidoDocumento: texto,
  pedidoTipo: textoOpc,
  fornecedorId: textoOpc,
  fornecedorNome: textoOpc,
  produtoId: textoOpc,
  produtoDescricao: textoOpc,
  produtoQuantidade: numeroOpc,
  produtoValorTotal: numeroOpc,
  moedaId: textoOpc,
  moedaSigla: textoOpc,
  empresaId: textoOpc,
});

const linhaCaixa = z.object({
  date: dataISO,
  centroCustoId: textoOpc,
  centroCustoDescricao: textoOpc,
  planoContaId: textoOpc,
  planoContaCodigo: textoOpc,
  planoContaDescricao: textoOpc,
  caixaId: textoOpc,
  caixaDescricao: textoOpc,
  valorDocumento: numeroOpc,
  moedaId: textoOpc,
  moedaSigla: textoOpc,
  empresaId: textoOpc,
});

// O câmbio é uma FOTO do histórico inteiro, como o estoque — vai sempre
// completo (~10 mil linhas, menos de 1 MB), porque controlar período aqui só
// traria o risco de um buraco por sincronismo parcial sem economizar nada.
//
// `taxa`: 1 unidade de origem equivale a `taxa` unidades de destino. Deixar
// isso implícito é a ambiguidade que mais gera valor invertido em relatório.
const linhaCambio = z.object({
  data: dataISO,
  moedaOrigem: texto,
  moedaDestino: texto,
  taxa: z.coerce.number().finite().positive(),
});

const linhaEstoque = z.object({
  productId: texto,
  description: textoOpc,
  manufacturerCode: textoOpc,
  stock: numeroOpc,
  costTotalUSD: numeroOpc,
  minStock: numeroOpc,
  currencyId: textoOpc,
  currencyCode: textoOpc,
  empresaId: textoOpc,
});

// ─── Registro ────────────────────────────────────────────────────────────────

export interface DefinicaoDataset {
  /** Tabela no banco do tenant — usada só no DELETE do período. */
  tabela: string;
  /**
   * Coluna que decide a que período a linha pertence — sempre a de emissão.
   * `null` = dataset sem data (estoque é uma foto do momento, não uma série).
   */
  colunaData: string | null;
  /** Delegate do Prisma Client, para o createMany. */
  delegate:
    | "saleItem" | "orcamentoItem" | "receivableItem" | "payableItem"
    | "caixaItem" | "inventoryItem" | "cambio" | "compraItem";
  schema: z.ZodType;
  /** Só para a mensagem de erro quando o lote é grande demais. */
  linhasTipicasPorMes: number;
}

export const DATASETS = {
  vendas: {
    tabela: "sale_items",
    colunaData: "date",
    delegate: "saleItem",
    schema: linhaVenda,
    linhasTipicasPorMes: 21_000,
  },
  orcamentos: {
    tabela: "orcamento_items",
    colunaData: "orcamento_data",
    delegate: "orcamentoItem",
    schema: linhaOrcamento,
    linhasTipicasPorMes: 19_000,
  },
  receber: {
    tabela: "receivable_items",
    colunaData: "issue_date",
    delegate: "receivableItem",
    schema: linhaReceber,
    linhasTipicasPorMes: 8_000,
  },
  pagar: {
    tabela: "payable_items",
    colunaData: "issue_date",
    delegate: "payableItem",
    schema: linhaPagar,
    linhasTipicasPorMes: 700,
  },
  compras: {
    tabela: "compra_items",
    // A data da FATURA da compra, que é o equivalente da emissão nos demais.
    colunaData: "pedido_data",
    delegate: "compraItem",
    schema: linhaCompra,
    linhasTipicasPorMes: 2_500,
  },
  caixa: {
    tabela: "caixa_items",
    colunaData: "date",
    delegate: "caixaItem",
    schema: linhaCaixa,
    linhasTipicasPorMes: 5_000,
  },
  estoque: {
    tabela: "inventory_items",
    colunaData: null,
    delegate: "inventoryItem",
    schema: linhaEstoque,
    linhasTipicasPorMes: 112_000,
  },
  cambio: {
    tabela: "cambio",
    colunaData: null,
    delegate: "cambio",
    schema: linhaCambio,
    linhasTipicasPorMes: 10_000,
  },
} as const satisfies Record<string, DefinicaoDataset>;

export type NomeDataset = keyof typeof DATASETS;

export function ehDataset(s: string): s is NomeDataset {
  return Object.prototype.hasOwnProperty.call(DATASETS, s);
}

export const NOMES_DATASET = Object.keys(DATASETS) as NomeDataset[];
