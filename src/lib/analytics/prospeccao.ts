import type { OrcamentoLineItem } from "@/lib/types/dataset";
import type { DateRange } from "@/lib/types";
import { isInRange } from "@/lib/utils/dates";

// Prospecção é calculada no navegador, a partir do dataset já carregado no
// store — mesmo contrato de Vendas/Estoque/Financeiro. Antes cada mudança de
// filtro disparava 8 consultas SQL paralelas, o que esgotava o pool de conexões
// do Prisma e obrigava o usuário a clicar em "Atualizar".

// Um orçamento em aberto vira "perdido" depois deste prazo sem confirmação.
const DIAS_PARA_PERDIDO = 30;

const MS_DIA = 86_400_000;

export type QuoteStatus = "ganho" | "aberto" | "perdido";

export interface ProspeccaoResumo {
  kpis: {
    total: number;
    ganhos: number;
    perdidos: number;
    abertos: number;
    taxaConversao: number;      // 0–100
    valorTotal: number;
    valorGanho: number;
    valorEmRisco: number;
    ticketMedio: number;
    itensPorOrcamento: number;
    tempoMedioDias: number;
  };
  status: Array<{ key: QuoteStatus; count: number; valor: number }>;
  evolucao: Array<{ mes: string; criados: number; confirmados: number; taxa: number; valor: number }>;
  vendedores: Array<{ vendedor: string; total: number; confirmados: number; taxa: number; valor: number }>;
  produtos: Array<{
    produtoId: string;
    produto: string;
    fabricante: string;
    vezesProposto: number;
    vezesConfirmado: number;
    taxa: number;
    valor: number;
  }>;
  clientes: Array<{ cliente: string; orcamentos: number; confirmados: number; valor: number }>;
  pendentes: Array<{ orcamento_id: string; cliente_nome: string; valor: number; dias: number }>;
  // Orçamentos existentes no dataset ignorando os filtros — permite à tela
  // distinguir "nada importado" de "nada dentro do período selecionado".
  totalGeral: number;
}

export const EMPTY_RESUMO: ProspeccaoResumo = {
  kpis: {
    total: 0, ganhos: 0, perdidos: 0, abertos: 0, taxaConversao: 0,
    valorTotal: 0, valorGanho: 0, valorEmRisco: 0, ticketMedio: 0,
    itensPorOrcamento: 0, tempoMedioDias: 0,
  },
  status: [], evolucao: [], vendedores: [], produtos: [], clientes: [], pendentes: [],
  totalGeral: 0,
};

export interface ProspeccaoOptions {
  range: DateRange;
  currency: string;                    // "1" | "2" | "3" | "ALL"
  empresaId: string;                   // id exato ou "all"
  rates: Record<string, number>;       // moedaId → R$
  // produtoId → código do fabricante, vindo do dataset de Estoque. Usado apenas
  // quando a própria linha do orçamento não traz produto_fabricante.
  mfrByProduct?: Map<string, string>;
}

// Orçamento consolidado a partir das suas linhas de item.
interface Quote {
  id: string;
  data: string;
  dataConfirmacao: string;
  confirmado: boolean;
  vendedor: string;
  cliente: string;
  valor: number;
  itens: number;
}

const taxa = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

const SEM_NOME = "—";

export function buildProspeccao(
  items: OrcamentoLineItem[],
  { range, currency, empresaId, rates, mfrByProduct }: ProspeccaoOptions
): ProspeccaoResumo {
  if (items.length === 0) return EMPTY_RESUMO;

  // Moeda específica → mantém o valor na própria moeda (sem conversão) e
  // descarta as demais. "Todas" → converte cada item para R$ pela sua taxa.
  // Mesma regra de buildOrders em use-dataset.ts.
  const valorItem = (it: OrcamentoLineItem) =>
    currency === "ALL" ? it.itemTotal * (rates[it.moedaId] ?? 1) : it.itemTotal;

  const passaFiltro = (it: OrcamentoLineItem) =>
    (empresaId === "all" || it.empresaId === empresaId) &&
    (currency === "ALL" || it.moedaId === currency) &&
    isInRange(it.orcamentoData, range);

  // ── Agregação ao nível de orçamento ────────────────────────────────────────
  const quotes = new Map<string, Quote>();
  // Produtos são analisados no nível do ITEM, não do orçamento. A chave é o
  // produto_id (e não a descrição): SKUs distintos podem compartilhar descrição,
  // e é o id que amarra o código do fabricante.
  const produtoAgg = new Map<string, {
    produtoId: string;
    descricao: string;
    fabricante: string;
    itens: Set<string>;
    confirmados: Set<string>;
    valor: number;
  }>();
  const todosOrcamentos = new Set<string>();

  for (const it of items) {
    todosOrcamentos.add(it.orcamentoId);
    if (!passaFiltro(it)) continue;

    const valor = valorItem(it);

    const q = quotes.get(it.orcamentoId);
    if (q) {
      q.confirmado = q.confirmado || it.orcamentoConfirmado;
      if (it.orcamentoData < q.data) q.data = it.orcamentoData;
      if (it.orcamentoDataConfirmacao > q.dataConfirmacao) q.dataConfirmacao = it.orcamentoDataConfirmacao;
      if (!q.vendedor && it.vendedorNome) q.vendedor = it.vendedorNome;
      if (!q.cliente && it.clienteNome) q.cliente = it.clienteNome;
      q.valor += valor;
      q.itens += 1;
    } else {
      quotes.set(it.orcamentoId, {
        id: it.orcamentoId,
        data: it.orcamentoData,
        dataConfirmacao: it.orcamentoDataConfirmacao,
        confirmado: it.orcamentoConfirmado,
        vendedor: it.vendedorNome,
        cliente: it.clienteNome,
        valor,
        itens: 1,
      });
    }

    const chaveProduto = it.produtoId || it.produtoDescricao || SEM_NOME;
    let p = produtoAgg.get(chaveProduto);
    if (!p) {
      p = {
        produtoId: it.produtoId,
        descricao: it.produtoDescricao || SEM_NOME,
        // Prefere o que veio no arquivo; senão cai no lookup do Estoque.
        fabricante: it.produtoFabricante || mfrByProduct?.get(it.produtoId) || "",
        itens: new Set(),
        confirmados: new Set(),
        valor: 0,
      };
      produtoAgg.set(chaveProduto, p);
    }
    p.itens.add(it.itemOrcamentoId);
    if (it.itemQuantidadeConfirmada > 0) p.confirmados.add(it.itemOrcamentoId);
    p.valor += valor;
  }

  const lista = [...quotes.values()];
  if (lista.length === 0) return { ...EMPTY_RESUMO, totalGeral: todosOrcamentos.size };

  const limitePerdido = Date.now() - DIAS_PARA_PERDIDO * MS_DIA;
  const statusDe = (q: Quote): QuoteStatus =>
    q.confirmado ? "ganho" : new Date(q.data).getTime() < limitePerdido ? "perdido" : "aberto";

  // ── KPIs e distribuição por status ─────────────────────────────────────────
  const porStatus: Record<QuoteStatus, { count: number; valor: number }> = {
    ganho: { count: 0, valor: 0 },
    aberto: { count: 0, valor: 0 },
    perdido: { count: 0, valor: 0 },
  };

  let valorTotal = 0;
  let itensTotal = 0;
  let somaDiasConfirmacao = 0;
  let confirmadosComData = 0;

  for (const q of lista) {
    const s = statusDe(q);
    porStatus[s].count += 1;
    porStatus[s].valor += q.valor;
    valorTotal += q.valor;
    itensTotal += q.itens;

    if (q.confirmado && q.dataConfirmacao) {
      const dias = (new Date(q.dataConfirmacao).getTime() - new Date(q.data).getTime()) / MS_DIA;
      if (Number.isFinite(dias)) {
        somaDiasConfirmacao += dias;
        confirmadosComData += 1;
      }
    }
  }

  const total = lista.length;
  const ganhos = porStatus.ganho.count;
  const valorGanho = porStatus.ganho.valor;

  // ── Evolução mensal (rótulo YYYY-MM, formatado no cliente por idioma) ──────
  const meses = new Map<string, { criados: number; confirmados: number; valor: number }>();
  for (const q of lista) {
    const mes = q.data.slice(0, 7);
    let m = meses.get(mes);
    if (!m) { m = { criados: 0, confirmados: 0, valor: 0 }; meses.set(mes, m); }
    m.criados += 1;
    if (q.confirmado) m.confirmados += 1;
    m.valor += q.valor;
  }

  // ── Vendedores e clientes ──────────────────────────────────────────────────
  const vendAgg = new Map<string, { total: number; confirmados: number; valor: number }>();
  const cliAgg = new Map<string, { orcamentos: number; confirmados: number; valor: number }>();

  for (const q of lista) {
    const v = q.vendedor || SEM_NOME;
    let va = vendAgg.get(v);
    if (!va) { va = { total: 0, confirmados: 0, valor: 0 }; vendAgg.set(v, va); }
    va.total += 1;
    // Valor do vendedor = apenas o que ele efetivamente converteu.
    if (q.confirmado) { va.confirmados += 1; va.valor += q.valor; }

    const c = q.cliente || SEM_NOME;
    let ca = cliAgg.get(c);
    if (!ca) { ca = { orcamentos: 0, confirmados: 0, valor: 0 }; cliAgg.set(c, ca); }
    ca.orcamentos += 1;
    if (q.confirmado) ca.confirmados += 1;
    ca.valor += q.valor;
  }

  const hoje = Date.now();

  // Processar produtos: separar em completos (100%) e incompletos
  const produtosFormatados = [...produtoAgg.values()]
    .map((p) => ({
      produtoId: p.produtoId,
      produto: p.descricao,
      fabricante: p.fabricante,
      vezesProposto: p.itens.size,
      vezesConfirmado: p.confirmados.size,
      taxa: taxa(p.confirmados.size, p.itens.size),
      valor: p.valor,
    }));
  const produtosCompletos = produtosFormatados
    .filter((p) => p.taxa === 100)
    .sort((a, b) => b.vezesProposto - a.vezesProposto)
    .slice(0, 20);
  const produtosIncompletos = produtosFormatados
    .filter((p) => p.taxa < 100)
    .sort((a, b) => a.taxa - b.taxa)
    .slice(0, 20);
  const totalProdutosIncompletos = produtosFormatados.filter((p) => p.taxa < 100).length;

  return {
    kpis: {
      total,
      ganhos,
      perdidos: porStatus.perdido.count,
      abertos: porStatus.aberto.count,
      taxaConversao: taxa(ganhos, total),
      valorTotal,
      valorGanho,
      valorEmRisco: Math.max(0, valorTotal - valorGanho),
      ticketMedio: total > 0 ? valorTotal / total : 0,
      itensPorOrcamento: total > 0 ? itensTotal / total : 0,
      tempoMedioDias:
        confirmadosComData > 0 ? Math.round((somaDiasConfirmacao / confirmadosComData) * 10) / 10 : 0,
    },
    status: (["ganho", "aberto", "perdido"] as QuoteStatus[]).map((key) => ({
      key,
      count: porStatus[key].count,
      valor: porStatus[key].valor,
    })),
    evolucao: [...meses.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, m]) => ({
        mes,
        criados: m.criados,
        confirmados: m.confirmados,
        taxa: taxa(m.confirmados, m.criados),
        valor: m.valor,
      })),
    vendedores: [...vendAgg.entries()]
      .map(([vendedor, v]) => ({
        vendedor,
        total: v.total,
        confirmados: v.confirmados,
        taxa: taxa(v.confirmados, v.total),
        valor: v.valor,
      }))
      .sort((a, b) => b.confirmados - a.confirmados || b.total - a.total)
      .slice(0, 12),
    produtos: produtosCompletos,
    produtosIncompletos,
    totalProdutosIncompletos,
    clientes: [...cliAgg.entries()]
      .map(([cliente, c]) => ({
        cliente,
        orcamentos: c.orcamentos,
        confirmados: c.confirmados,
        taxa: taxa(c.confirmados, c.orcamentos),
        valor: c.valor,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 20),
    pendentes: lista
      .filter((q) => statusDe(q) === "perdido")
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 15)
      .map((q) => ({
        orcamento_id: q.id,
        cliente_nome: q.cliente || SEM_NOME,
        valor: q.valor,
        dias: Math.floor((hoje - new Date(q.data).getTime()) / MS_DIA),
      })),
    totalGeral: todosOrcamentos.size,
  };
}
