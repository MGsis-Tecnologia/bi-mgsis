import { CircleDollarSign } from "lucide-react";
import type { HelpSection } from "../types";

export const receber: HelpSection = {
  id: "receber",
  group: "Financeiro",
  label: "Contas a Receber",
  route: "/financeiro/receber",
  icon: CircleDollarSign,
  summary: "\"Contas a receber.\" — inadimplência, aging e previsão de recebimentos por cliente, vendedor e cidade.",
  globalFilters:
    "Empresa, moeda e vendedor (o único filtro de escopo global que também vale aqui — canal e subgrupo não se aplicam a título financeiro).",
  localFilters:
    "O filtro de período incide sobre a data de VENCIMENTO, não de emissão. O limite SUPERIOR do período só é aplicado quando você escolhe um período personalizado — os presets prontos (ex. \"este mês\") terminam em \"hoje\" sem limite superior, propositalmente, para não esconder título a vencer no futuro.",
  metrics: [
    {
      id: "duas-bases",
      title: "Duas bases na mesma tela",
      description: "A tela é dividida em duas metades com escopos diferentes.",
      logic:
        "\"A receber\" (indicadores, aging, tabela principal) considera só títulos PENDENTES. \"Análise de recebimentos\" (recebido vs. pendente, comportamento por cliente) considera pendentes + já recebidos juntos.",
    },
    {
      id: "indicadores",
      title: "Indicadores da carteira",
      description: "KPIs de topo: total a receber, vencido, a vencer etc.",
    },
    {
      id: "aging",
      title: "Aging — faixas de atraso",
      description: "Quanto do valor pendente está em cada faixa de atraso.",
      logic: "dias de atraso = hoje (data do navegador) − data de vencimento. Faixas: em dia (atraso ≤ 0), 1–30, 31–60, 61–90, acima de 90 dias.",
      howToRead: "\"avgDaysOverdue\" (atraso médio, quando exibido) é ponderado pelo VALOR de cada título, não uma média simples de dias — um título grande e muito atrasado pesa mais que vários pequenos.",
    },
    {
      id: "timeline",
      title: "Curva de vencimentos",
      description: "Linha do tempo de quanto vence em cada período futuro/passado.",
    },
    {
      id: "por-cliente-cidade-vendedor",
      title: "Maiores clientes / A receber por cidade / Carteira por vendedor",
      description: "Três recortes do mesmo valor pendente, agrupados por dimensões diferentes.",
    },
    {
      id: "tabela",
      title: "Títulos a receber",
      description: "Lista detalhada de cada título pendente: documento, cliente, vendedor, vencimento, valor e situação.",
      logic: "Câmbio usado para converter moeda é o da data de EMISSÃO do título, não do vencimento.",
    },
    {
      id: "recebido-pendente",
      title: "Recebido vs. Pendente · por mês de vencimento",
      description: "Compara, mês a mês, quanto já foi recebido contra quanto ainda está pendente.",
      logic: "collectionRate (taxa de recebimento) = total recebido ÷ (recebido + pendente).",
    },
    {
      id: "comportamento",
      title: "Comportamento de recebimento · por cliente",
      description: "Para cada cliente, o atraso médio real no pagamento.",
      logic: "avgDelayDays só considera títulos já pagos E com data de recebimento preenchida — título ainda pendente não entra nessa média.",
    },
  ],
};
