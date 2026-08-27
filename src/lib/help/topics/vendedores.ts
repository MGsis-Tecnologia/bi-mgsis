import { UserSquare2 } from "lucide-react";
import type { HelpSection } from "../types";

export const vendedores: HelpSection = {
  id: "vendedores",
  group: "Catálogo",
  label: "Vendedores",
  route: "/vendedores",
  icon: UserSquare2,
  summary:
    "\"Quem vende.\" A tela mais complexa do Analytics: junta desempenho de venda, prospecção por vendedor e consistência de resultado, cada bloco vindo de uma base diferente.",
  globalFilters: "Período, empresa, moeda, canal, vendedor e subgrupo se aplicam ao ranking principal.",
  metrics: [
    {
      id: "ranking",
      title: "Ranking de vendedores",
      description: "Tabela principal: receita, pedidos, ticket médio e achievement por vendedor no período.",
      logic: "achievement = receita do vendedor ÷ receita do MELHOR vendedor do período — mesmo índice relativo usado no Executivo, não é meta cadastrada.",
    },
    {
      id: "devolucoes",
      title: "Devoluções por vendedor",
      description: "Aparece como número separado na tabela, com valor negativo.",
    },
    {
      id: "prospeccao-carteira",
      title: "Prospecção & carteira",
      description: "Para cada vendedor, quantos clientes são novos e quantos deram churn no período.",
      logic:
        "Usa o histórico COMPLETO de vendas para decidir, por par (vendedor, cliente): é NOVO se a primeira compra desse cliente com esse vendedor caiu dentro do período filtrado; é CHURN se o cliente comprava com ele antes do período e não comprou nada dentro dele. Esse cálculo ignora os filtros de canal/vendedor/subgrupo do popover global — sempre olha tudo, para poder comparar \"antes\" e \"dentro\" do período corretamente.",
    },
    {
      id: "consistencia",
      title: "Consistência & concentração",
      description: "Mede o quanto a receita de um vendedor é estável ao longo do período, ou depende de poucos pedidos/clientes grandes.",
      logic:
        "Consistência usa o coeficiente de variação (CV) da receita diária, contando dias sem venda como zero — quanto maior o CV, mais irregular é o vendedor. Concentração mostra top1Pct/top3Pct (% da receita vindo do maior pedido / dos 3 maiores) e topClientPct (% vindo do maior cliente). dayCoverage é a fração de dias em que o vendedor teve pelo menos uma venda, sobre os dias operacionais do time.",
      howToRead:
        "Um vendedor com receita alta mas top1Pct também alto depende de poucos pedidos grandes — resultado bom, mas frágil se aquele cliente específico sumir.",
    },
  ],
};
