import { Activity } from "lucide-react";
import type { HelpSection } from "../types";

export const dashboard: HelpSection = {
  id: "dashboard",
  group: "Visão",
  label: "Executivo",
  route: "/dashboard",
  icon: Activity,
  summary:
    "A primeira tela depois do login: um resumo do período — receita, margem, tendência — e os destaques que merecem atenção sem precisar abrir cada tela específica.",
  globalFilters:
    "Usa o filtro global completo: período, empresa, moeda e também canal/vendedor/subgrupo, quando selecionados no popover de filtros. Desde 11/08/2026 os KPIs do topo usam o mesmo escopo do gráfico logo abaixo — antes disso os dois podiam divergir.",
  localFilters:
    "Um período de comparação (\"comparar com\") é opcional: só aparece diferença contra o período anterior quando ele é definido explicitamente. Sem ele, os indicadores de variação ficam zerados, não escondidos.",
  metrics: [
    {
      id: "insights",
      title: "Insights automáticos",
      description:
        "Cartões de texto gerados a partir dos números do período — por exemplo, alerta de queda de margem, tendência de receita ou destaque de subgrupo.",
      logic:
        "Cada insight é uma regra própria (ex.: \"margin-alert\" dispara quando a margem cai contra a comparação) rodando sobre os mesmos dados agregados do resto da tela — não é um modelo de IA interpretando o período, é um conjunto de condições fixas.",
      filters: "Mesmo escopo de filtros da tela inteira (período, empresa, moeda, canal/vendedor/subgrupo).",
      howToRead:
        "Cada insight tem um link \"investigar\" que leva direto à tela onde aquele número nasce (normalmente Vendas ou Produtos).",
    },
    {
      id: "receita-categoria",
      title: "Receita por categoria",
      description: "Barras com a receita do período somada por subgrupo de produto.",
      logic:
        "Soma por ITEM: um pedido com produtos de dois subgrupos diferentes contribui para as duas barras, cada uma com a fatia correspondente — diferente do gráfico por canal, que soma por pedido inteiro.",
    },
    {
      id: "receita-canal",
      title: "Receita por canal",
      description: "Participação de cada canal de venda (loja física, WhatsApp, e-commerce etc.) na receita do período.",
      logic:
        "Soma por PEDIDO: o canal é um atributo único do pedido inteiro, não da linha — não há como um mesmo pedido aparecer em dois canais.",
    },
    {
      id: "heatmap",
      title: "Mapa de calor · dia × semana",
      description: "Grade mostrando em que dias do mês e dias da semana a receita se concentra.",
      howToRead:
        "Útil para identificar padrão de sazonalidade dentro do mês (ex.: pico em datas de pagamento, quedas em fins de semana) que uma linha do tempo simples esconde.",
    },
    {
      id: "meta",
      title: "Meta vs. realizado",
      description: "Receita acumulada no período contra a meta definida para ele.",
    },
    {
      id: "top-produtos",
      title: "Produtos mais vendidos",
      description: "Ranking dos produtos com maior receita no período — recorte curto, para visão rápida.",
      filters: "Para a curva ABC completa e a tabela detalhada, use a tela Produtos.",
    },
    {
      id: "top-vendedores",
      title: "Top vendedores",
      description: "Ranking dos vendedores por receita no período, com um indicador de \"achievement\".",
      logic:
        "achievement = receita do vendedor ÷ receita do MELHOR vendedor do período — não é meta individual cadastrada, é um índice relativo ao líder do próprio período. 100% significa \"é o líder\", não \"bateu a meta\".",
    },
  ],
};
