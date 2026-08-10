/**
 * Períodos aceitos pela ingestão.
 *
 *   "2026-07"                  → o mês inteiro
 *   "2026-07-01..2026-07-15"   → intervalo explícito, inclusivo dos dois lados
 *   "tudo"                     → só para dataset sem data (estoque)
 *
 * O intervalo existe para quem tiver mês grande demais para uma requisição só:
 * dá para partir o mês em quinzenas sem perder a atomicidade, porque cada
 * pedaço é um período fechado e independente.
 */

export interface Periodo {
  /** Rótulo original, devolvido na resposta. */
  rotulo: string;
  /** null quando é "tudo". */
  de: string | null;
  ate: string | null;
}

const MES = /^(\d{4})-(\d{2})$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const INTERVALO = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

function dataValida(d: string): boolean {
  const t = Date.parse(d + "T00:00:00Z");
  if (Number.isNaN(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === d;
}

function ultimoDia(ano: number, mes: number): string {
  // Dia 0 do mês seguinte é o último do mês corrente — cobre fevereiro e bissexto.
  const d = new Date(Date.UTC(ano, mes, 0));
  return d.toISOString().slice(0, 10);
}

export function interpretaPeriodo(bruto: string): Periodo | { erro: string } {
  const s = bruto.trim();

  if (s === "tudo") return { rotulo: "tudo", de: null, ate: null };

  const mes = MES.exec(s);
  if (mes) {
    const ano = Number(mes[1]);
    const m = Number(mes[2]);
    if (m < 1 || m > 12) return { erro: `mês inválido em "${s}"` };
    if (ano < 1990 || ano > 2035) return { erro: `ano fora de 1990–2035 em "${s}"` };
    return { rotulo: s, de: `${mes[1]}-${mes[2]}-01`, ate: ultimoDia(ano, m) };
  }

  const faixa = INTERVALO.exec(s);
  if (faixa) {
    const [, de, ate] = faixa as unknown as [string, string, string];
    if (!dataValida(de) || !dataValida(ate)) {
      return { erro: `data inexistente no calendário em "${s}"` };
    }
    if (de > ate) return { erro: `período invertido: "${de}" é maior que "${ate}"` };
    if (de < "1990-01-01" || ate > "2035-12-31") {
      return { erro: `período fora de 1990–2035 em "${s}"` };
    }
    return { rotulo: s, de, ate };
  }

  if (DIA.test(s)) {
    if (!dataValida(s)) return { erro: `data inexistente no calendário: "${s}"` };
    return { rotulo: s, de: s, ate: s };
  }

  return {
    erro:
      `período "${bruto}" não reconhecido. Use "2026-07" (mês), ` +
      `"2026-07-01..2026-07-15" (intervalo) ou "tudo" (apenas estoque).`,
  };
}

export function ehErro(p: Periodo | { erro: string }): p is { erro: string } {
  return "erro" in p;
}
