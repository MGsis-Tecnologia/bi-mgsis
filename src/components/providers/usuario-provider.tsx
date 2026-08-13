"use client";

import * as React from "react";

/**
 * Dados públicos do usuário logado, para componentes de cliente.
 *
 * O layout do dashboard é um Server Component e já tem a sessão em mãos; o
 * Next não repassa props de layout para page, então o caminho é um contexto.
 * A alternativa seria um `/api/me`, que custaria uma requisição por carga de
 * página para entregar o que o servidor já sabia ao renderizar.
 *
 * **Só o que é público.** Nada de `empresaId`, `role` ou `allowedMenus` aqui:
 * o que controla acesso é decidido no servidor, e espelhar no cliente convida
 * alguém a confiar nesse espelho.
 */
export interface UsuarioLogado {
  nome: string;
  email: string;
  /**
   * Moeda de exibição da empresa ("1"|"2"|"3"). É só rótulo aqui: quem
   * converte é o servidor, pela cotação do dia de cada linha. O cliente
   * precisa dela para saber que símbolo escrever quando o filtro está em
   * "todas as moedas".
   */
  moedaPadrao: string;
}

const Contexto = React.createContext<UsuarioLogado | null>(null);

export function UsuarioProvider({
  usuario,
  children,
}: {
  usuario: UsuarioLogado;
  children: React.ReactNode;
}) {
  // O layout passa um objeto novo a cada render; memoizar pelos campos evita
  // que todo consumidor do contexto re-renderize à toa.
  const valor = React.useMemo<UsuarioLogado>(
    () => ({ nome: usuario.nome, email: usuario.email, moedaPadrao: usuario.moedaPadrao }),
    [usuario.nome, usuario.email, usuario.moedaPadrao]
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useUsuario(): UsuarioLogado | null {
  return React.useContext(Contexto);
}

/**
 * Primeiro nome, para saudação. "Rogerio Garcia" → "Rogerio".
 * Devolve "" quando não há sessão, e quem chama decide o que fazer.
 */
export function usePrimeiroNome(): string {
  const usuario = useUsuario();
  return usuario?.nome.trim().split(/\s+/)[0] ?? "";
}
