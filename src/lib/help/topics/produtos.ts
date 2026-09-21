import { Package } from "lucide-react";
import type { HelpSection } from "../types";

export const produtos: HelpSection = {
  id: "produtos",
  group: "Catálogo",
  label: "Produtos",
  route: "/produtos",
  icon: Package,
  summary: "\"O que vende.\" — curva ABC, mix por categoria, ranking por lucro e detalhamento por categoria.",
  globalFilters: "Período, empresa, moeda, canal, vendedor e subgrupo se aplicam normalmente.",
  metrics: [
    {
      id: "ranking",
      title: "Ranking de produtos",
      description: "Produtos ordenados por receita no período.",
    },
    {
      id: "mix",
      title: "Mix por categoria",
      description: "Participação de cada subgrupo/categoria na receita total.",
    },
    {
      id: "curva-abc",
      title: "Curva ABC",
      description: "Classifica os produtos em A, B ou C pela participação acumulada na receita.",
      logic:
        "Ordena produtos por receita (maior pra menor) e soma a participação acumulada: os primeiros que juntos somam até 80% da receita são classe A, até 95% é classe B, o resto é classe C. O corte é calculado sobre TODOS os produtos do período, e a tabela lista todos os que tiveram venda: as linhas vêm de 50 em 50 conforme você rola, sem cortar em um top N. O gráfico do topo mostra só os 12 maiores.",
      howToRead: "Classe A é o pequeno grupo que sustenta a maior parte da receita — é onde ruptura de estoque ou perda de cliente dói mais.",
    },
    {
      id: "ranking-lucro",
      title: "Ranking por Lucro",
      description: "Todos os produtos com venda no período, ordenados por lucro (não por receita). A tabela tem barra de rolagem e carrega 50 linhas por vez conforme você desce.",
      logic: "lucro = receita − custo. Os totais no rodapé da tabela somam a lista inteira, não só os 30 exibidos.",
    },
    {
      id: "curva-abc-categoria",
      title: "Curva ABC por categoria",
      description: "A mesma lógica de classificação A/B/C, mas aplicada a subgrupos/categorias em vez de produtos individuais — com o detalhamento completo de todas as categorias.",
    },
    {
      id: "curva-abc-marca",
      title: "Curva ABC por marca",
      description: "A mesma classificação A/B/C aplicada às marcas, com receita, unidades e quantidade de SKUs de cada uma.",
      logic:
        "A marca é identificada pelo código (marca_id), como no Comparativo. Vendas sem marca informada — inclusive as de períodos que ainda não foram reenviados depois de a marca entrar na view — somam numa linha \"Sem marca\". Respeita os mesmos filtros da tela.",
    },
    {
      id: "produtos-parados",
      title: "Produtos parados",
      description: "Quantos produtos do catálogo não tiveram nenhuma venda no período filtrado.",
      logic:
        "É a diferença entre o total de produtos distintos em TODO o histórico (ignora o período) e os produtos que tiveram venda dentro do período filtrado.",
    },
    {
      id: "fabricante",
      title: "Código do fabricante",
      description: "Coluna que aparece nas tabelas de produto.",
      logic: "Vem do dataset de ESTOQUE, não do de vendas — um produto vendido mas ausente do snapshot de estoque não tem esse código preenchido.",
    },
  ],
};
