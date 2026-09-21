import { CalendarRange } from "lucide-react";
import type { HelpSection } from "../types";

export const comparativo: HelpSection = {
  id: "comparativo",
  group: "Visão",
  label: "Comparativo Anual",
  route: "/comparativo",
  icon: CalendarRange,
  summary:
    "Compara a receita ano a ano de um item específico — um vendedor, um subgrupo, uma marca, um canal, um cliente, um produto ou um fornecedor — ou uma visão geral de todos os itens de uma dimensão.",
  globalFilters:
    "Só empresa e moeda. Esta tela IGNORA o filtro de período e os filtros de canal/vendedor/subgrupo do popover global — ela sempre olha o histórico completo, porque o próprio propósito da tela é comparar anos inteiros entre si.",
  localFilters:
    "Seletor de dimensão (Vendedores/Subgrupos/Marcas/Canais/Clientes/Produtos/Fornecedores) e, na tabela, uma busca por nome (em Produtos, também por código do produto e código do fabricante) e a ordenação clicando no cabeçalho de uma coluna.",
  metrics: [
    {
      id: "dimensoes",
      title: "Dimensões disponíveis",
      description: "Vendedores, Subgrupos, Marcas, Canais, Clientes, Produtos e Fornecedores — cada um com seu próprio ranking anual.",
      logic:
        "Subgrupos são identificados pelo NOME, não por código interno — dois subgrupos com nomes iguais em cadastros diferentes se fundem numa linha só. Já as marcas são identificadas pelo CÓDIGO (marca_id): duas marcas com o mesmo nome e códigos diferentes aparecem em linhas separadas. Vendas sem marca informada (por exemplo, de períodos ainda não reenviados depois de a marca entrar na view) aparecem juntas como \"Sem marca\". Fornecedores usa a mesma regra da tabela \"Comprado × vendido por fornecedor\" da tela de Fornecedores: a venda não sabe de quem a peça veio, o elo é o produto. Cada produto entra para o fornecedor de quem MAIS se comprou dele no período, e a receita de venda do produto inteira vai para esse fornecedor. Como aqui a tela é anual, a regra vale ANO A ANO: a coluna de 2026 usa quem mais se comprou em 2026 (só pedidos do tipo COMPRA), a de 2025 usa 2025 — e por isso o mesmo produto pode pertencer a fornecedores diferentes em anos diferentes. O número de um ano bate com o \"vendido\" da tela de Fornecedores filtrada naquele ano. Produto vendido num ano sem compra registrada não tem fornecedor e não aparece — por isso a soma da aba fica abaixo da receita total das outras.",
    },
    {
      id: "visao-geral",
      title: "Receita por ano · visão geral",
      description:
        "O gráfico compara os 15 maiores itens da dimensão escolhida, ano a ano. A tabela logo abaixo lista TODOS os itens da dimensão, do maior ao menor faturamento, com rolagem: as linhas vêm de 50 em 50 conforme você desce.",
      logic:
        "O gráfico é sempre o top 15 por receita total e não muda com a busca nem com a ordem da tabela. Em Produtos, o código do fabricante aparece abaixo da descrição e vem do dataset de ESTOQUE — produto vendido mas ausente do snapshot de estoque fica sem o código.",
    },
    {
      id: "detalhamento-item",
      title: "Evolução anual de um item + Detalhamento por ano",
      description:
        "Clicar numa linha da tabela monta, acima dela, o gráfico só daquele item (todos os anos da base) e uma tabela com a variação percentual de cada ano contra o anterior. A tabela completa continua abaixo, com a linha destacada, para você clicar em outro item sem voltar. Clicar de novo na mesma linha, ou em \"Limpar seleção\", volta ao top 15.",
      logic:
        "\"Var. anual\" na tabela completa é sempre entre os DOIS ÚLTIMOS anos que existem na base — não é a variação de cada linha contra a linha de cima. No detalhe de um item, cada ano é comparado com o anterior.",
      howToRead:
        "O ano corrente, quando incompleto, aparece marcado \"YTD\" e pode vir com uma projeção estimada (barra com ★) calculada no navegador a partir do ritmo do ano até agora — não é dado real do restante do ano.",
    },
  ],
};
