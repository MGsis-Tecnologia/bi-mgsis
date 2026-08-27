import { Upload } from "lucide-react";
import type { HelpSection } from "../types";

export const importacao: HelpSection = {
  id: "importacao",
  group: "Operação",
  label: "Importação",
  route: "/importacao",
  icon: Upload,
  summary:
    "\"Importação de dados.\" Não é uma tela de análise — é o fluxo de upload manual usado por quem ainda não tem o agente automático do ERP MGSIS. Cada dataset (vendas, compras, estoque, contas a receber/pagar, caixa, orçamentos, câmbio) tem seu próprio layout de arquivo.",
  globalFilters: "Não se aplicam — esta tela não tem gráfico nem filtro de análise, só upload e status.",
  metrics: [
    {
      id: "schema",
      title: "Schema esperado",
      description: "Para cada dataset, mostra as colunas exigidas, seus tipos e uma nota explicando regras específicas daquele arquivo.",
      logic:
        "Datas no formato DD/MM/AAAA, decimais com vírgula (padrão BR), moeda indicada por moeda_id (1=R$, 2=US$, 3=G$). Cada dataset tem particularidades: vendas importa linhas com pedido_tipo VENDA e DEVOLUCAO VENDA; estoque é uma foto (sem período); caixa usa valor negativo para saída e positivo para entrada; câmbio substitui a tabela de cotações inteira a cada envio.",
      howToRead: "Envie um arquivo fora do schema esperado e a importação recusa a linha problemática — confira a mensagem de erro para saber qual coluna corrigir.",
    },
    {
      id: "dados-importados",
      title: "Dados importados",
      description: "Mostra o que já está carregado no sistema para cada dataset — útil para conferir se o último envio realmente entrou.",
    },
    {
      id: "relacao-agente",
      title: "Relação com o agente automático",
      description: "Quem tem o ERP MGSIS não precisa usar esta tela no dia a dia.",
      logic: "O agente de ingestão (instalado no servidor do cliente) escreve nas mesmas tabelas que esta tela de importação manual — os dois caminhos não conflitam, e podem coexistir.",
    },
  ],
};
