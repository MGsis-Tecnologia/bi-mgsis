/**
 * Contrato das opções dos filtros globais.
 *
 * Vive aqui, e não no módulo de análise, porque o navegador precisa do tipo e
 * do valor vazio: importá-los de `server/analytics/opcoes` arrastaria o Prisma
 * para o bundle do cliente.
 */

export interface OpcoesFiltro {
  canais: string[];
  subgrupos: { id: string; name: string }[];
  vendedores: { id: string; name: string }[];
  /**
   * empresa_id presentes em QUALQUER dataset — o filtro de empresa é global.
   * `name` vem do dataset "empresa" (view bi_empresa); "" quando essa empresa
   * ainda não foi enviada — o rótulo cai então no id cru (ver empresa-switcher).
   */
  empresas: { id: string; name: string }[];
  /**
   * Condições de pagamento dos títulos a receber. Só a tela de Receber usa: não
   * é um filtro global, mas a lista vem junto porque é o mesmo endpoint, já
   * carregado e em cache no topbar.
   */
  condicoesPagamento: { id: string; name: string }[];
  /** Há título a receber sem condição — vira a opção "Sem condição informada". */
  temTituloSemCondicao: boolean;
}

export const OPCOES_VAZIAS: OpcoesFiltro = {
  canais: [],
  subgrupos: [],
  vendedores: [],
  empresas: [],
  condicoesPagamento: [],
  temTituloSemCondicao: false,
};
