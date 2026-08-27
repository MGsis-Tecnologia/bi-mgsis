import { Wallet } from "lucide-react";
import type { HelpSection } from "../types";

export const pagar: HelpSection = {
  id: "pagar",
  group: "Financeiro",
  label: "Contas a Pagar",
  route: "/financeiro/pagar",
  icon: Wallet,
  summary: "\"Contas a pagar.\" — vencimentos, atrasos e fluxo de caixa das obrigações com fornecedores. Espelha a tela Contas a Receber, ponto a ponto.",
  globalFilters:
    "Empresa e moeda. Diferente de Receber, esta tela NÃO aplica o filtro de vendedor, mesmo que ele esteja selecionado no popover global — obrigação de pagamento não tem vendedor associado.",
  localFilters:
    "Período incide sobre a data de VENCIMENTO. Mesma regra de Receber: o limite superior do período só entra em períodos personalizados, não nos presets prontos.",
  metrics: [
    {
      id: "indicadores",
      title: "Indicadores da carteira",
      description: "KPIs de topo: total a pagar, vencido, a vencer.",
    },
    {
      id: "aging",
      title: "Aging — faixas de atraso",
      description: "Mesma lógica de Contas a Receber: dias de atraso = hoje − vencimento, em faixas (em dia, 1–30, 31–60, 61–90, 90+).",
      howToRead: "O atraso médio também é ponderado por valor, não por contagem simples de títulos.",
    },
    {
      id: "timeline",
      title: "Curva de vencimentos",
      description: "Linha do tempo de quanto vence em cada período.",
    },
    {
      id: "por-fornecedor",
      title: "Maiores fornecedores a pagar",
      description: "Ranking de fornecedores por valor pendente. Não há esse recorte por cidade ou vendedor aqui, ao contrário de Receber.",
    },
    {
      id: "tabela",
      title: "Títulos a pagar",
      description: "Lista detalhada: documento, fornecedor, vencimento, valor e situação.",
    },
    {
      id: "pago-pendente",
      title: "Pago vs. Pendente · por mês de vencimento",
      description: "Compara, mês a mês, quanto já foi pago contra quanto ainda está pendente.",
    },
    {
      id: "comportamento",
      title: "Comportamento de pagamento · por fornecedor",
      description: "Atraso médio real de pagamento a cada fornecedor.",
      logic: "Só considera títulos já pagos com data de pagamento preenchida.",
    },
  ],
};
