import * as XLSX from "xlsx";

/**
 * Gera um .xlsx a partir de uma lista de objetos planos (chave = cabeçalho da
 * coluna, na ordem em que aparecem no primeiro objeto) e dispara o download no
 * navegador. Genérico de propósito — a primeira tabela a usar é a de estoque,
 * mas qualquer tela pode chamar com suas próprias linhas.
 */
export function exportarExcel(
  nomeArquivo: string,
  sheetName: string,
  linhas: Record<string, string | number>[]
) {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // limite do Excel pro nome da aba
  XLSX.writeFile(wb, nomeArquivo);
}
