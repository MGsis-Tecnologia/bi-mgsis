import { Truck } from "lucide-react";
import type { HelpSection } from "../types";

export const fornecedores: HelpSection = {
  id: "fornecedores",
  group: "Catálogo",
  label: "Fornecedores",
  route: "/fornecedores",
  icon: Truck,
  summary:
    "\"De quem compramos.\" — evolução do gasto, concentração de dependência, curva ABC de fornecedores e o cruzamento entre o que se compra e o que se vende.",
  globalFilters:
    "Período, empresa e moeda. Sem filtro de canal nem vendedor — assim como em Compras, esses conceitos não existem do lado do fornecedor.",
  localFilters: "Abas Mês/Trimestre/Ano/Ano-a-ano no gráfico de evolução do gasto.",
  metrics: [
    {
      id: "fonte",
      title: "De onde vem o dado",
      description: "Mesma origem de Compras (itens de compra). Não existe cadastro de fornecedor à parte — quem aparece numa compra é fornecedor.",
    },
    {
      id: "evolucao-gasto",
      title: "Evolução do gasto",
      description: "Série do valor comprado ao longo do tempo, com abas de granularidade.",
    },
    {
      id: "duas-datas",
      title: "Prazo de entrega",
      description: "Indicador de quantos dias, em média, um fornecedor leva para entregar.",
      logic:
        "A tela usa duas datas diferentes: a data de CHEGADA (que define o período de tudo na tela) e a data de EMISSÃO do documento no fornecedor (opcional). Prazo de entrega = chegada − emissão, em média.",
    },
    {
      id: "participacao",
      title: "Participação no total comprado",
      description: "Fatia de cada fornecedor no total gasto no período.",
    },
    {
      id: "risco-dependencia",
      title: "Risco de dependência",
      description: "Mede o quanto a compra está concentrada em poucos fornecedores.",
      logic:
        "Usa o índice HHI (Herfindahl-Hirschman): soma dos quadrados da participação de cada fornecedor no total comprado. Quanto mais perto de 1, mais concentrado num único fornecedor; acima de 0,25 já é considerado concentração alta. A tela também mostra a participação do maior fornecedor sozinho, dos 2 maiores e dos 5 maiores.",
      howToRead:
        "HHI alto é um sinal de risco operacional: se aquele fornecedor falhar ou reajustar preço, não há alternativa próxima em volume.",
    },
    {
      id: "gasto-categoria",
      title: "Gasto por categoria",
      description: "Gasto agrupado por subgrupo do produto comprado — os mesmos códigos usados em Vendas, permitindo comparar o que se compra com o que se vende por categoria.",
    },
    {
      id: "novos-recorrentes",
      title: "Novos e recorrentes",
      description: "Quantos fornecedores são novos no período versus já recorrentes.",
      logic: "\"Novo\" = fornecedor sem NENHUMA compra registrada antes do início do período filtrado.",
    },
    {
      id: "curva-abc-cruzada",
      title: "Curva ABC cruzada — produto × fornecedor",
      description: "Matriz cruzando a classificação ABC do produto com a classificação ABC do fornecedor que o vende.",
      logic:
        "Mesmo corte 80%/95% da curva ABC de outras telas, aplicado nas duas dimensões ao mesmo tempo — cada célula é uma combinação, por exemplo \"produto classe A comprado de fornecedor classe C\".",
    },
    {
      id: "comprado-vendido",
      title: "Comprado × Vendido por fornecedor",
      description: "Compara o que foi comprado de cada fornecedor com o que foi efetivamente vendido dos produtos dele.",
      logic:
        "Como a venda não registra o fornecedor diretamente, cada produto é atribuído ao fornecedor de quem MAIS se comprou dele no período — regra \"o vencedor leva tudo\": a venda inteira do produto vai para um único fornecedor, sem ratear entre vários que também o forneceram.",
      howToRead: "Se um produto tem dois fornecedores próximos em volume, esse número pode superestimar um e zerar o outro — é uma aproximação, não um rastreamento exato de lote.",
    },
    {
      id: "ranking",
      title: "Ranking de fornecedores",
      description: "Tabela geral, ordenada por valor comprado no período.",
    },
  ],
};
