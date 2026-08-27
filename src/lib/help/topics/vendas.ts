import { BarChart3 } from "lucide-react";
import type { HelpSection } from "../types";

export const vendas: HelpSection = {
  id: "vendas",
  group: "Visão",
  label: "Análise de Vendas",
  route: "/vendas",
  icon: BarChart3,
  summary:
    "\"Como vendemos.\" — evolução temporal, sazonalidade, distribuição regional e a lista de pedidos mais recentes.",
  globalFilters: "Período, empresa, moeda, canal, vendedor e subgrupo — todos se aplicam aqui.",
  localFilters:
    "Abas Mês/Dia/Ano/Clientes/Desconto trocam a dimensão do gráfico de evolução temporal, sem mudar o período nem os outros cartões da tela.",
  metrics: [
    {
      id: "evolucao",
      title: "Evolução temporal",
      description: "Série da receita ao longo do tempo, com abas para trocar a granularidade e a métrica.",
      filters: "Abas: Mês, Dia, Ano, Clientes (nº de clientes distintos) e Desconto (valor descontado).",
    },
    {
      id: "sazonalidade",
      title: "Sazonalidade · dia × semana",
      description: "Grade de receita cruzando dia do mês com dia da semana, igual em espírito ao mapa de calor do Executivo, mas só para vendas.",
    },
    {
      id: "regiao",
      title: "Receita por região",
      description: "Receita agrupada por cidade do cliente.",
      logic:
        "A agregação usa o texto CRU do campo cidade do cliente, como veio do ERP — sem normalização (ex.: \"São Paulo\" e \"Sao paulo\" contam separado se vierem digitados diferente na origem).",
    },
    {
      id: "mapa-cidade",
      title: "Mapa de Vendas por Cidade",
      description: "O mesmo dado de receita por cidade, plotado num mapa geográfico.",
      logic: "A geocodificação (achar a posição no mapa a partir do nome da cidade) acontece no navegador, não no servidor.",
    },
    {
      id: "pedidos",
      title: "Últimos pedidos",
      description: "Tabela com os pedidos mais recentes do período: cliente, vendedor, canal, itens, total, margem e status.",
      logic:
        "Devoluções vêm da mesma tabela de vendas (tipo \"DEVOLUCAO VENDA\") e aparecem com valor negativo na tabela — mas os KPIs de topo da tela somam devolução como valor positivo à parte, não como abatimento direto da receita bruta.",
    },
    {
      id: "ticket-desconto",
      title: "Ticket médio e desconto",
      description: "Dois indicadores que aparecem nos KPIs do topo da tela.",
      logic:
        "ticket médio = receita ÷ número de pedidos. % de desconto = desconto ÷ (receita + desconto) — ou seja, desconto como fração do valor BRUTO (antes do desconto), não do valor líquido que o cliente pagou.",
    },
  ],
};
