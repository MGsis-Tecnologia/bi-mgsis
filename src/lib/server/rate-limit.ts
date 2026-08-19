// Limitador de taxa em memória, por processo.
//
// Escopo deliberadamente pequeno: serve a rotas PÚBLICAS que disparam efeito
// caro e externo — hoje só o "Esqueci minha senha", que manda e-mail pela conta
// SMTP única do sistema. Sem isso, qualquer um com o CNPJ/RUC de uma empresa
// transforma a rota num canhão de spam saindo do nosso domínio.
//
// ⚠️ Vive na memória do processo: com mais de uma instância do Next atrás de um
// balanceador, cada uma conta o seu próprio quinhão (o limite efetivo vira
// N × o configurado). Para a instalação atual — um container — está correto;
// se um dia houver réplicas, o contador precisa mudar de casa (Redis, ou uma
// tabela no catalog).

interface Janela {
  /** Timestamps dos hits dentro da janela, em ordem crescente. */
  hits: number[];
}

const buckets = new Map<string, Janela>();

// Sem varredura periódica: a limpeza é oportunista, no próprio consumo. O mapa
// só cresce enquanto houver chaves ativas, e um timer aberto atrapalharia o
// encerramento do processo em dev.
let ultimaLimpeza = 0;
const INTERVALO_LIMPEZA_MS = 60_000;

function limpaExpirados(agora: number, janelaMs: number) {
  if (agora - ultimaLimpeza < INTERVALO_LIMPEZA_MS) return;
  ultimaLimpeza = agora;
  for (const [chave, janela] of buckets) {
    if (janela.hits.every((t) => agora - t >= janelaMs)) buckets.delete(chave);
  }
}

export interface LimiteResultado {
  permitido: boolean;
  /** Quantos segundos faltam pra próxima tentativa ser aceita (0 se permitido). */
  esperaSegundos: number;
}

/**
 * Consome uma unidade da cota de `chave`. Janela deslizante: conta os hits dos
 * últimos `janelaMs` e recusa a partir do `max`+1. Uma tentativa recusada NÃO
 * é registrada — quem insiste no erro não estica a própria punição.
 */
export function consomeLimite(
  chave: string,
  opts: { max: number; janelaMs: number }
): LimiteResultado {
  const agora = Date.now();
  limpaExpirados(agora, opts.janelaMs);

  const janela = buckets.get(chave) ?? { hits: [] };
  janela.hits = janela.hits.filter((t) => agora - t < opts.janelaMs);

  if (janela.hits.length >= opts.max) {
    buckets.set(chave, janela);
    const maisAntigo = janela.hits[0];
    return {
      permitido: false,
      esperaSegundos: Math.max(1, Math.ceil((opts.janelaMs - (agora - maisAntigo)) / 1000)),
    };
  }

  janela.hits.push(agora);
  buckets.set(chave, janela);
  return { permitido: true, esperaSegundos: 0 };
}

/** IP de origem da requisição, atrás do proxy reverso (Coolify/Traefik). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "desconhecido";
}
