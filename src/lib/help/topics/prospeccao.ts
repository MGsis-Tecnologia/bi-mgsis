import { Receipt } from "lucide-react";
import type { HelpSection } from "../types";

export const prospeccao: HelpSection = {
  id: "prospeccao",
  group: "Visão",
  label: "Prospecção",
  route: "/prospeccao",
  icon: Receipt,
  summary:
    "Acompanha orçamentos e propostas: quantos viram venda, quantos ainda estão em aberto e quantos foram perdidos — a etapa antes da venda acontecer.",
  globalFilters:
    "Período (sobre a data do orçamento), empresa e moeda. NÃO tem filtro de canal, vendedor nem subgrupo — nenhum dos três do popover global se aplica aqui.",
  metrics: [
    {
      id: "fonte",
      title: "De onde vem o dado",
      description: "Itens de orçamento — uma fonte separada das vendas confirmadas.",
    },
    {
      id: "status",
      title: "Distribuição por status",
      description: "Quantos orçamentos estão Ganhos (confirmados), Abertos ou Perdidos.",
      logic:
        "Ganho = orçamento confirmado. Perdido = NÃO confirmado E a data do orçamento já passou de 30 dias (calculado contra a data do navegador de quem está olhando a tela, não do servidor). Aberto = o resto — ainda dentro da janela de 30 dias, sem decisão.",
    },
    {
      id: "pendentes",
      title: "Orçamentos pendentes",
      description: "Lista dos orçamentos ainda em aberto, aguardando confirmação ou expiração.",
    },
    {
      id: "tempo-confirmacao",
      title: "Tempo de confirmação",
      description: "Quantos dias, em média, um orçamento leva entre ser criado e ser confirmado.",
      logic: "Só conta orçamentos que JÁ foram confirmados e têm a data de confirmação preenchida — orçamento aberto não entra na média.",
    },
    {
      id: "evolucao",
      title: "Evolução: criados × confirmados",
      description: "Série temporal comparando quantos orçamentos foram criados contra quantos foram confirmados, com a taxa de conversão.",
      logic: "taxa de conversão = confirmados ÷ total, em %.",
    },
    {
      id: "vendedores",
      title: "Conversão por vendedor",
      description: "Ranking de vendedores por taxa de conversão de orçamento em venda.",
      logic:
        "Aqui o valor considerado é só o CONFIRMADO — diferente da tabela de produtos abaixo, que soma o valor orçado inteiro (confirmado + não confirmado).",
    },
    {
      id: "produtos",
      title: "Conversão por produto",
      description: "Quais produtos mais aparecem em orçamentos, e com que frequência viram venda.",
      logic:
        "\"vezes proposto\" conta LINHAS de orçamento (um mesmo produto em dois orçamentos diferentes conta duas vezes). A lista corta produtos com menos de 5 propostas no período, para não poluir com itens muito raros.",
    },
    {
      id: "clientes",
      title: "Top clientes por valor proposto",
      description: "Clientes com maior valor total em orçamentos no período, ganhos ou não.",
    },
    {
      id: "valor-em-risco",
      title: "Valor em risco",
      description: "Quanto dinheiro está em orçamentos ainda não confirmados.",
      logic: "valorEmRisco = valor total orçado − valor já ganho (nunca fica negativo).",
    },
  ],
};
