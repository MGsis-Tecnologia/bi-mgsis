import { Boxes } from "lucide-react";
import type { HelpSection } from "../types";

export const estoque: HelpSection = {
  id: "estoque",
  group: "Catálogo",
  label: "Estoque",
  route: "/estoque",
  icon: Boxes,
  summary:
    "\"O que está em estoque.\" Cruza o snapshot atual do estoque (uma foto, sem data) com o movimento de vendas do período filtrado, para mostrar cobertura, ruptura, dormência e capital alocado por SKU.",
  globalFilters:
    "Empresa e moeda de exibição. O PERÍODO filtrado define a \"demanda\" usada para calcular cobertura e status — o estoque em si (quantidade e custo) é sempre a foto mais recente, não muda com o período.",
  localFilters:
    "Clique num card de status (Ruptura/Risco/Sem giro/Excesso) filtra a tabela de detalhamento por aquele status — é o mesmo filtro do dropdown \"Status\" que fica em cima da tabela, só um atalho visual pros mesmos cinco valores; clicar de novo no mesmo card desliga o filtro. O dropdown \"Cobertura\" filtra pela mesma faixa do donut (Sem cobertura, Fora de análise, Até 1 mês ... Mais de 12 meses); o donut em si NÃO é clicável. Busca por SKU/descrição/fabricante roda no servidor (o catálogo tem dezenas de milhares de itens, grande demais para filtrar no navegador) e se combina com os dois dropdowns. IMPORTANTE: os três filtros recortam APENAS a tabela de Detalhamento por SKU. Os KPIs do topo, o donut de cobertura, as barras de Distribuição por status, o capital por categoria e as listas de Ruptura & risco, Sem giro e Estoque mínimo mostram sempre o universo inteiro e não se mexem quando você filtra — o único sinal de que um filtro está ativo é o contador \"X de Y itens\" e a linha \"filtro:\" no cabeçalho da tabela.",
  metrics: [
    {
      id: "cobertura",
      title: "Cobertura de estoque",
      description:
        "Donut mostrando o capital em estoque (US$) e o % de itens agrupados por faixa de meses que o saldo atual cobre a demanda.",
      logic:
        "coverageDays = estoque atual ÷ demanda média diária, onde a demanda vem das vendas do PERÍODO filtrado. O resultado em dias é convertido em faixas de meses: sem cobertura (estoque zerado), fora de análise (tem estoque mas nenhuma venda no período — não dá pra estimar demanda), até 1 mês, 1–2, 2–4, 4–6, 6–12 e acima de 12 meses.",
      howToRead:
        "\"Fora de análise\" não é erro — é um produto com estoque parado que simplesmente não vendeu no recorte de tempo escolhido; alargar o período de filtro pode tirá-lo dessa faixa.",
    },
    {
      id: "status",
      title: "Distribuição por status / KPIs do topo",
      description: "Quatro indicadores: capital total em estoque, ruptura, em risco, e sem giro + excesso.",
      logic:
        "Ruptura = estoque zerado mas com saída no período (era vendido e acabou), ou SKU que vendeu e nem aparece no snapshot de estoque. Risco = cobertura ≤ 15 dias. Excesso = cobertura ≥ 180 dias. Sem giro = estoque positivo e zero saída no período, ou estoque zerado sem nenhuma saída. Normal = o que sobra. As regras são testadas NESSA ordem e a primeira que bate vence, então cada SKU tem um status só.",
      howToRead:
        "O corte do Excesso é em DIAS (180), e 180 dias dão 5,9 meses — não 6. Por isso o Excesso já começa dentro da faixa \"4 a 6 meses\" do donut, em vez de começar junto com a faixa \"6 a 12\". É a razão de um punhado de itens aparecer como Excesso numa faixa que a intuição diria ser saudável.",
    },
    {
      id: "categoria",
      title: "Capital em estoque por categoria",
      description: "Top 10 categorias/subgrupos por valor total imobilizado em estoque.",
    },
    {
      id: "ruptura-risco",
      title: "Ruptura & risco",
      description: "Lista dos itens sem estoque (mas com saída recente) ou com cobertura ≤ 15 dias — candidatos a reposição urgente.",
    },
    {
      id: "top-movimentacao",
      title: "Top movimentação",
      description: "Os 10 itens com maior saída no período — base para decidir o que repor primeiro.",
    },
    {
      id: "capital-parado",
      title: "Capital parado · sem giro",
      description: "SKUs com estoque positivo e zero saída no período, ordenados pelo maior valor imobilizado.",
    },
    {
      id: "estoque-minimo",
      title: "Abaixo do estoque mínimo",
      description: "Produtos com estoque mínimo cadastrado e quantidade atual igual ou abaixo do ponto de reposição. Só aparece quando existe pelo menos um produto nessa condição.",
    },
    {
      id: "detalhamento-sku",
      title: "Detalhamento por SKU",
      description:
        "Tabela com TODO o catálogo filtrado, por produto — não é um recorte: role dentro da tabela (ela tem rolagem própria) pra ver do primeiro ao último item. Mesmo com dezenas de milhares de linhas a rolagem fica leve porque só o que está visível na tela é desenhado de verdade.",
      logic:
        "Ordem padrão: cobertura DECRESCENTE (maior cobertura no topo — quem tem mais capital parado por mais tempo aparece primeiro), e onde a cobertura empata, custo em US$/moeda selecionada decrescente desempata. Itens sem cobertura calculável (estoque zerado ou nunca vendido no período) ficam no FIM da lista, não no topo — \"sem dado\" não é a mesma coisa que \"cobertura alta\".",
      filters:
        "Dropdown de Status, dropdown de Cobertura e busca por texto — os três se combinam (ex.: Status=Excesso + Cobertura=\"Mais de 12 meses\" + busca=\"filtro\" mostra só o que bate com tudo isso ao mesmo tempo). A busca cobre quatro campos: descrição, SKU, código do fabricante e categoria; \"%\" e \"_\" são tratados como texto comum, não como curinga. O botão \"Excel\" ao lado da busca baixa em .xlsx exatamente as linhas que estão passando por esses filtros no momento, com todas as colunas da tabela — útil pra levar um recorte específico (ex.: só o que está em risco) pra fora do sistema.",
      columns: [
        { name: "SKU", desc: "Código do produto no ERP (product_id) — identificador único da linha." },
        { name: "Descrição", desc: "Nome do produto. Em laranja/aviso quando o SKU vendeu no período mas não existe no snapshot de estoque importado." },
        { name: "Fabricante", desc: "Código do fabricante, vindo do dataset de ESTOQUE (não do de vendas)." },
        { name: "Categoria", desc: "Subgrupo do produto — mesma categoria usada em Vendas, Produtos e Fornecedores." },
        { name: "Estoque", desc: "Quantidade em estoque AGORA (a foto mais recente importada), somada entre empresas quando o filtro de empresa é \"Todas\"." },
        { name: "Mínimo", desc: "Estoque mínimo cadastrado para o produto, quando existe. Em aviso quando o estoque atual já está nele ou abaixo." },
        { name: "Custo", desc: "Valor total do estoque desse SKU, na moeda selecionada no filtro global — não é o custo unitário, é quantidade × custo unitário." },
        { name: "Saídas", desc: "Unidades vendidas no PERÍODO filtrado (não é histórico total, é só dentro da janela de data escolhida)." },
        { name: "Receita", desc: "Receita gerada por esse SKU no mesmo período filtrado." },
        { name: "Cobertura", desc: "Quantos meses (e, entre parênteses, anos) o estoque atual sustenta no ritmo de venda do período — mesmo cálculo do donut, em número exato em vez de faixa." },
        { name: "Últ. saída", desc: "Data da venda mais recente desse SKU dentro do período, e há quantos dias foi (contado a partir de hoje, não do fim do período)." },
        { name: "Status", desc: "Ruptura, Em risco, Normal, Excesso ou Sem giro — mesma classificação dos cards de \"Distribuição por status\" no topo da tela." },
      ],
      howToRead:
        "\"999+m\" na coluna Cobertura não é exatamente 999 meses — é o teto de exibição pra quando a demanda no período é tão baixa que a conta daria um número absurdamente alto; o item claramente está parado, o número exato não muda a conclusão. Sobre combinar os dois dropdowns: Status e Cobertura NÃO são eixos independentes — os dois saem do mesmo cálculo de cobertura, então boa parte dos cruzamentos é vazia por construção, e a tela não avisa (os dropdowns listam sempre todas as opções, inclusive as que têm zero item). O que mora em cada faixa: \"Sem cobertura\" só tem Ruptura e Sem giro; \"Fora de análise\" só tem Sem giro; \"Até 1 mês\" tem Em risco (até 15 dias) e Normal (de 15 a 30 dias); \"1 a 2\" e \"2 a 4 meses\" só têm Normal; \"4 a 6 meses\" tem Normal e o comecinho do Excesso; \"6 a 12\" e \"Mais de 12 meses\" só têm Excesso. Lendo ao contrário: Ruptura só existe em \"Sem cobertura\" e Em risco só em \"Até 1 mês\" — combinar esses dois status com qualquer outra faixa devolve lista vazia. As combinações que rendem são Excesso + \"Mais de 12 meses\" (capital morto de verdade), Sem giro + \"Fora de análise\" (tem estoque e não vendeu, separado do que está zerado) e Normal + \"4 a 6 meses\" (quem está prestes a virar excesso).",
    },
  ],
};
