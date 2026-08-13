import type { PrismaClient } from "@prisma/client";

/**
 * Câmbio: normalização na entrada e reconstrução da tabela densa.
 *
 * O desenho está na seção 6.1 do PLANO-DADOS. O resumo do que importa aqui:
 *
 *  - **Uma cotação por par.** O sentido inverso é `1 / taxa`, não um número
 *    independente. Sem compra e venda separadas.
 *  - **Tudo deriva de um pivô**, que é a moeda contra a qual o ERP cota — e é
 *    DEDUZIDO dos dados, não configurado. Com 3 moedas há 6 sentidos, mas 2
 *    pares contra o pivô bastam para gerar todos. Isso não é só economia: é o
 *    que impede dois relatórios do sistema de se contradizerem, porque
 *    converter G$→R$ direto ou passando por U$ dá o mesmo número por construção.
 *
 *    **Não confunda com a moeda padrão da empresa**, que é só a moeda de
 *    EXIBIÇÃO. São independentes: o ERP paraguaio cota contra guarani, e nada
 *    impede a empresa de querer ler o painel em reais. Como a `cambio_diario`
 *    sai completa (todos os sentidos), qualquer exibição funciona.
 *  - **Carry-forward é obrigatório.** O ERP só grava cotação quando há
 *    movimento naquela moeda — dólar aparece em 5,9% dos dias neste cliente.
 *    Sem preencher os buracos, um JOIN faria 94% das vendas em dólar sumirem
 *    do relatório sem erro nenhum.
 */

export interface LinhaCambio {
  data: string;
  moedaOrigem: string;
  moedaDestino: string;
  taxa: number;
}

export interface ProblemaCambio {
  indice: number;
  motivo: string;
}

/**
 * Faixa aceitável por par, em unidades de destino por 1 de origem.
 *
 * Existe porque G$ e U$ diferem em ~4 zeros: uma taxa trocada de par não gera
 * erro nenhum no banco, só um relatório milhares de vezes maior ou menor. Os
 * limites são folgados de propósito — barram inversão de sentido e erro de
 * escala, não oscilação de mercado.
 */
const FAIXAS: Record<string, [number, number]> = {
  "2>3": [1_000, 50_000], // 1 US$ em guaranis
  "1>3": [200, 10_000], // 1 R$  em guaranis
  "2>1": [0.5, 50], // 1 US$ em reais
};

function chaveFaixa(origem: string, destino: string): string {
  return `${origem}>${destino}`;
}

/**
 * O pivô da tabela de câmbio é DEDUZIDO DOS DADOS, não configurado.
 *
 * É a moeda contra a qual o ERP cota — em Assunção, guarani ("1 dólar = X
 * guaranis"). Não confundir com a **moeda padrão da empresa**, que é só a
 * moeda de exibição: são coisas independentes, e amarrá-las quebra o caso de
 * uma empresa paraguaia querer ler o painel em reais.
 *
 * Como a `cambio_diario` sai completa (todos os sentidos), qualquer moeda de
 * exibição funciona sobre o mesmo pivô.
 */
export function detectaPivo(linhas: LinhaCambio[]): string | null {
  const contagem = new Map<string, number>();
  for (const l of linhas) {
    contagem.set(l.moedaDestino, (contagem.get(l.moedaDestino) ?? 0) + 1);
  }
  let pivo: string | null = null;
  let melhor = -1;
  // Empate resolvido pelo menor id, para o resultado não depender da ordem.
  for (const [moeda, n] of [...contagem.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (n > melhor) {
      melhor = n;
      pivo = moeda;
    }
  }
  return pivo;
}

/**
 * Normaliza para um sentido só e valida.
 *
 * O agente no cliente não precisa se preocupar com a direção: se o ERP mandar
 * o par invertido, aqui ele é gravado no sentido canônico (X → pivô) com
 * `1 / taxa`.
 *
 * Par cruzado — nenhum lado é o pivô — **não é recusado**: vai para `cambio`,
 * que é a trilha de auditoria e precisa refletir o ERP. A `cambio_diario` o
 * ignora e deriva aquele sentido do pivô, que é o que garante que converter
 * G$→R$ direto ou passando por US$ dê o mesmo número.
 */
export function normaliza(
  linhas: LinhaCambio[],
  pivo: string
): { validas: LinhaCambio[]; problemas: ProblemaCambio[] } {
  const validas: LinhaCambio[] = [];
  const problemas: ProblemaCambio[] = [];
  // Para conferir ida-e-volta do mesmo par no mesmo dia.
  const vistas = new Map<string, number>();

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]!;

    if (!(l.taxa > 0) || !Number.isFinite(l.taxa)) {
      problemas.push({ indice: i, motivo: `taxa inválida: ${l.taxa}` });
      continue;
    }
    if (l.moedaOrigem === l.moedaDestino) {
      problemas.push({ indice: i, motivo: `origem e destino iguais (${l.moedaOrigem})` });
      continue;
    }
    // Par cruzado (nenhum lado é o pivô): entra como veio, para a auditoria
    // bater com o ERP. A `cambio_diario` o ignora e deriva aquele sentido do
    // pivô — é o que impede dois caminhos de conversão darem números
    // diferentes. Ver a nota no topo.
    if (l.moedaOrigem !== pivo && l.moedaDestino !== pivo) {
      validas.push(l);
      continue;
    }

    // Canônico: destino é sempre o pivô. Chegou G$→U$, vira U$→G$ com 1/taxa.
    const canonica: LinhaCambio =
      l.moedaDestino === pivo
        ? l
        : { data: l.data, moedaOrigem: l.moedaDestino, moedaDestino: pivo, taxa: 1 / l.taxa };

    const faixa = FAIXAS[chaveFaixa(canonica.moedaOrigem, canonica.moedaDestino)];
    if (faixa && (canonica.taxa < faixa[0] || canonica.taxa > faixa[1])) {
      problemas.push({
        indice: i,
        motivo:
          `taxa ${canonica.taxa} fora da faixa esperada para ` +
          `${canonica.moedaOrigem}→${canonica.moedaDestino} (${faixa[0]}–${faixa[1]}) — ` +
          `sentido invertido ou erro de escala`,
      });
      continue;
    }

    const chave = `${canonica.data}|${canonica.moedaOrigem}|${canonica.moedaDestino}`;
    const anterior = vistas.get(chave);
    if (anterior !== undefined) {
      // Mesmo par, mesmo dia, duas vezes: se vieram em sentidos opostos,
      // taxa_ida × taxa_volta ≈ 1. Divergência grande é inversão.
      const razao = canonica.taxa / anterior;
      if (razao < 0.98 || razao > 1.02) {
        problemas.push({
          indice: i,
          motivo: `mesma data e par com taxas divergentes: ${anterior} e ${canonica.taxa}`,
        });
      }
      continue; // fica a primeira
    }
    vistas.set(chave, canonica.taxa);
    validas.push(canonica);
  }

  return { validas, problemas };
}

/**
 * Reconstrói `cambio_diario` inteira a partir de `cambio`.
 *
 * Tudo em SQL, numa transação: são ~10 mil linhas e a reescrita completa é mais
 * simples — e mais segura — do que atualizar incrementalmente. O plano chama
 * isso de "um caso onde a força bruta é a escolha certa".
 *
 * O que ela produz, para cada dia do calendário coberto:
 *   pivô→pivô      = 1
 *   X→pivô         = cotação do dia, ou a última conhecida antes dele
 *   pivô→X         = 1 / (X→pivô)
 *   X→Y (cruzado)  = (X→pivô) / (Y→pivô)
 */
export async function reconstroiCambioDiario(
  db: PrismaClient
): Promise<{ dias: number; linhas: number; de: string; ate: string; pivo: string; ms: number }> {
  const inicio = Date.now();

  // O pivô sai da própria tabela: a moeda que mais aparece como destino é
  // aquela contra a qual o ERP cota. Deduzir em vez de configurar elimina uma
  // fonte de erro — e mantém o câmbio independente da moeda de EXIBIÇÃO
  // escolhida por cada empresa.
  const [p] = await db.$queryRawUnsafe<{ pivo: string | null }[]>(
    `SELECT moeda_destino AS pivo FROM cambio
      GROUP BY moeda_destino ORDER BY COUNT(*) DESC, moeda_destino LIMIT 1`
  );
  const pivo = p?.pivo ?? "";

  const linhas = await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM cambio_diario`);

      // Sem cotação nenhuma não há o que derivar — e criar linhas com taxa 1
      // seria pior que não ter: converteria guarani em real na razão de 1:1.
      const [{ n }] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM cambio`
      );
      if (Number(n) === 0) return 0;

      const inseridas = await tx.$executeRawUnsafe(
        `
        WITH limites AS (
          -- O calendário cobre do PRIMEIRO FATO até HOJE, não só o intervalo
          -- das cotações.
          --
          -- Até hoje, porque o ERP só cota quando há movimento: numa
          -- segunda-feira, a última pode ser de sexta, e as vendas do fim de
          -- semana ficariam sem taxa — some a linha do relatório, sem erro.
          --
          -- Desde o primeiro fato, porque a cotação mais antiga do ERP costuma
          -- ser posterior à venda mais antiga. Sem isso, a carga inicial teria
          -- um bloco inteiro sem conversão logo no começo do histórico.
          SELECT LEAST(
                   COALESCE((SELECT MIN(data) FROM cambio), '9999'),
                   COALESCE((SELECT MIN(date) FROM sale_items WHERE date <> ''), '9999'),
                   COALESCE((SELECT MIN(issue_date) FROM receivable_items WHERE issue_date <> ''), '9999'),
                   COALESCE((SELECT MIN(issue_date) FROM payable_items WHERE issue_date <> ''), '9999'),
                   COALESCE((SELECT MIN(date) FROM caixa_items WHERE date <> ''), '9999'),
                   COALESCE((SELECT MIN(orcamento_data) FROM orcamento_items WHERE orcamento_data <> ''), '9999')
                 ) AS de,
                 GREATEST(
                   (SELECT MAX(data) FROM cambio),
                   to_char(CURRENT_DATE, 'YYYY-MM-DD')
                 ) AS ate
        ),
        -- Todo dia do calendário entre a primeira cotação e hoje.
        dias AS (
          SELECT to_char(d, 'YYYY-MM-DD') AS data
            FROM limites,
                 generate_series(limites.de::date, limites.ate::date, interval '1 day') AS d
        ),
        -- Só as moedas cotadas CONTRA o pivô: par cruzado fica na auditoria
        -- e tem o sentido derivado, não copiado.
        moedas AS (
          SELECT DISTINCT moeda_origem AS moeda FROM cambio WHERE moeda_destino = $1
          UNION SELECT $1
        ),
        -- Dia sem cotação usa a MAIS PRÓXIMA, em qualquer sentido.
        --
        -- Carry-forward puro (só olhar para trás) deixava sem taxa tudo que
        -- fosse anterior à primeira cotação do ERP — e é justamente o começo
        -- do histórico, onde a carga inicial mais tem linha.
        --
        -- Duas buscas com LIMIT 1 em vez de um ORDER BY abs(diferença): assim
        -- cada uma usa o índice (moeda_origem, data) e faz uma leitura, em vez
        -- de percorrer todas as cotações da moeda para cada dia do calendário.
        vizinhas AS (
          SELECT g.data, m.moeda AS origem, ant.taxa AS taxa_ant, ant.data AS data_ant,
                 prox.taxa AS taxa_prox, prox.data AS data_prox
            FROM dias g
            CROSS JOIN moedas m
            LEFT JOIN LATERAL (
              SELECT c.taxa, c.data FROM cambio c
               WHERE c.moeda_origem = m.moeda AND c.moeda_destino = $1 AND c.data <= g.data
               ORDER BY c.data DESC LIMIT 1
            ) ant ON true
            LEFT JOIN LATERAL (
              SELECT c.taxa, c.data FROM cambio c
               WHERE c.moeda_origem = m.moeda AND c.moeda_destino = $1 AND c.data > g.data
               ORDER BY c.data ASC LIMIT 1
            ) prox ON true
           WHERE m.moeda <> $1
        ),
        contra_pivo AS (
          SELECT data, origem,
                 CASE
                   WHEN taxa_ant IS NULL THEN taxa_prox
                   WHEN taxa_prox IS NULL THEN taxa_ant
                   -- Empate fica com a do passado: usar cotação futura para
                   -- transação passada é o menos defensável dos dois.
                   WHEN (data::date - data_ant::date) <= (data_prox::date - data::date)
                     THEN taxa_ant
                   ELSE taxa_prox
                 END AS taxa
            FROM vizinhas
        ),
        -- O pivô contra ele mesmo é 1, sempre.
        base AS (
          SELECT data, origem, taxa FROM contra_pivo WHERE taxa IS NOT NULL
          UNION ALL
          SELECT data, $1, 1 FROM dias
        )
        INSERT INTO cambio_diario (data, moeda_origem, moeda_destino, taxa)
        -- X→pivô
        SELECT data, origem, $1, taxa FROM base WHERE origem <> $1
        UNION ALL
        -- pivô→X
        SELECT data, $1, origem, 1 / taxa FROM base WHERE origem <> $1
        UNION ALL
        -- X→Y cruzado, derivado do pivô: nunca contradiz o caminho direto
        SELECT a.data, a.origem, b.origem, a.taxa / b.taxa
          FROM base a JOIN base b ON b.data = a.data
         WHERE a.origem <> b.origem AND a.origem <> $1 AND b.origem <> $1
        UNION ALL
        -- X→X = 1, para toda moeda. Com isso a tabela cobre os 9 sentidos e
        -- serve para converter para QUALQUER destino, não só para o pivô — o
        -- que importa se a moeda padrão da empresa mudar depois.
        SELECT data, origem, origem, 1 FROM base
        `,
        pivo
      );

      return inseridas;
    },
    { timeout: 120_000, maxWait: 30_000 }
  );

  const [cob] = await db.$queryRawUnsafe<{ d: number; de: string | null; ate: string | null }[]>(
    `SELECT COUNT(DISTINCT data)::int AS d, MIN(data) AS de, MAX(data) AS ate FROM cambio_diario`
  );

  // A cobertura vai na resposta da API de propósito: é assim que o agente (e
  // quem lê o log) enxerga que a primeira cotação é posterior às vendas mais
  // antigas — o único buraco que sobra, e que só o ERP pode fechar.
  return {
    dias: Number(cob?.d ?? 0),
    linhas,
    de: cob?.de ?? "",
    ate: cob?.ate ?? "",
    pivo,
    ms: Date.now() - inicio,
  };
}
