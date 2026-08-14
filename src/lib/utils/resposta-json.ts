/**
 * Lê a resposta de uma rota de análise, sem transformar erro do servidor em
 * ruído.
 *
 * O padrão anterior era `await res.json()` antes de olhar o `res.ok`. Quando a
 * rota morria de verdade — uma tabela que ainda não existe no tenant, por
 * exemplo —, o Next devolvia 500 com corpo VAZIO, o `json()` estourava e a tela
 * mostrava "Failed to execute 'json' on 'Response': Unexpected end of JSON
 * input". A mensagem falava do parser e escondia a causa; foi o que aconteceu
 * quando a migration do câmbio ainda não tinha sido aplicada.
 *
 * Agora o corpo é lido como texto primeiro: se veio JSON, usa o `error` que a
 * rota mandou; se veio vazio ou HTML (página de erro do Next), diz o status e
 * que o servidor não explicou.
 */
export async function leJson<T>(res: Response): Promise<T> {
  const texto = await res.text();

  let corpo: unknown = null;
  if (texto.trim()) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = null;
    }
  }

  if (!res.ok) {
    const erro =
      corpo && typeof corpo === "object" && "error" in corpo
        ? String((corpo as { error: unknown }).error)
        : `Erro ${res.status} — o servidor não devolveu detalhe. Veja o log da aplicação.`;
    throw new Error(erro);
  }

  if (corpo === null) {
    throw new Error(`Resposta vazia ou inválida do servidor (HTTP ${res.status}).`);
  }
  return corpo as T;
}
