import { LayoutList } from "lucide-react";
import type { HelpSection } from "../types";

export const dre: HelpSection = {
  id: "dre",
  group: "Financeiro",
  label: "Caixa & DRE",
  route: "/financeiro/dre",
  icon: LayoutList,
  summary: "\"Ingressos & DRE.\" — fluxo de caixa, demonstrativo de resultado, despesas por conta e por centro de custo.",
  globalFilters:
    "Período (com limite inferior E superior — diferente de Receber/Pagar, que às vezes usam só o limite inferior), empresa e moeda.",
  metrics: [
    {
      id: "fonte",
      title: "De onde vem o dado",
      description: "Movimentações de caixa importadas — uma linha por lançamento, com valor positivo (entrada) ou negativo (saída).",
    },
    {
      id: "fluxo-caixa",
      title: "Fluxo de Caixa",
      description: "Série temporal de entradas e saídas de caixa no período.",
      logic:
        "Ingressos = soma de todos os valores positivos. Gastos = módulo (valor absoluto) da soma dos valores menores ou iguais a zero — um lançamento de valor zero entra em \"gastos\" com valor zero, não é ignorado.",
    },
    {
      id: "dre",
      title: "Demonstrativo de Resultado (DRE)",
      description: "Ingressos, gastos e margem do período, na estrutura clássica de DRE.",
      logic: "margem = (ingressos − gastos) ÷ ingressos, em %.",
    },
    {
      id: "despesas-conta",
      title: "Despesas por Conta",
      description: "Gastos agrupados pela hierarquia do plano de contas.",
      logic:
        "O código do plano de contas usa ponto para indicar hierarquia (ex.: 1, 1.1, 1.1.01) — a árvore e o agrupamento de fatias pequenas do gráfico são montados no navegador, não vêm prontos do servidor. Uma conta-pai sem lançamento próprio soma o valor dos filhos.",
    },
    {
      id: "centro-custo",
      title: "Por Centro de Custo",
      description: "Os mesmos gastos, agora agrupados por centro de custo em vez de plano de contas.",
    },
  ],
};
