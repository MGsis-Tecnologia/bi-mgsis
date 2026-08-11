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
  /** empresa_id presentes em QUALQUER dataset — o filtro de empresa é global. */
  empresas: string[];
}

export const OPCOES_VAZIAS: OpcoesFiltro = {
  canais: [],
  subgrupos: [],
  vendedores: [],
  empresas: [],
};
