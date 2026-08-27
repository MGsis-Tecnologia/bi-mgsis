import { CalendarRange } from "lucide-react";
import type { HelpSection } from "../types";

export const comparativo: HelpSection = {
  id: "comparativo",
  group: "Visão",
  label: "Comparativo Anual",
  route: "/comparativo",
  icon: CalendarRange,
  summary:
    "Compara a receita ano a ano de um item específico — um vendedor, um subgrupo, um canal, um cliente ou um produto — ou uma visão geral de todos os itens de uma dimensão.",
  globalFilters:
    "Só empresa e moeda. Esta tela IGNORA o filtro de período e os filtros de canal/vendedor/subgrupo do popover global — ela sempre olha o histórico completo, porque o próprio propósito da tela é comparar anos inteiros entre si.",
  localFilters:
    "Seletor de dimensão (Vendedores/Subgrupos/Canais/Clientes/Produtos) e busca/combobox para escolher um item específico dentro da dimensão.",
  metrics: [
    {
      id: "dimensoes",
      title: "Dimensões disponíveis",
      description: "Vendedores, Subgrupos, Canais, Clientes e Produtos — cada um com seu próprio ranking anual.",
      logic:
        "Subgrupos são identificados pelo NOME, não por código interno — dois subgrupos com nomes iguais em cadastros diferentes se fundem numa linha só.",
    },
    {
      id: "visao-geral",
      title: "Receita por ano · visão geral",
      description: "Gráfico e tabela comparando os 15 principais itens da dimensão escolhida, ano a ano.",
    },
    {
      id: "detalhamento-item",
      title: "Evolução anual de um item + Detalhamento por ano",
      description:
        "Ao escolher um item específico (ex.: um vendedor), a tela mostra a evolução dele ano a ano e uma tabela com a variação percentual de cada ano contra o anterior.",
      logic:
        "\"Var. anual\" (growth) é sempre entre os DOIS ÚLTIMOS anos que existem na base para aquele item — não é a variação de cada linha da tabela contra a linha de cima.",
      howToRead:
        "O ano corrente, quando incompleto, aparece marcado \"YTD\" e pode vir com uma projeção estimada (barra com ★) calculada no navegador a partir do ritmo do ano até agora — não é dado real do restante do ano.",
    },
  ],
};
