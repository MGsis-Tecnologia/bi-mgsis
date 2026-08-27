import type { HelpSection } from "../types";
import { dashboard } from "./dashboard";
import { vendas } from "./vendas";
import { compras } from "./compras";
import { comparativo } from "./comparativo";
import { prospeccao } from "./prospeccao";
import { produtos } from "./produtos";
import { estoque } from "./estoque";
import { clientes } from "./clientes";
import { fornecedores } from "./fornecedores";
import { vendedores } from "./vendedores";
import { dre } from "./dre";
import { receber } from "./receber";
import { pagar } from "./pagar";
import { importacao } from "./importacao";

// Mesma ordem dos grupos e itens da sidebar (src/components/layout/sidebar.tsx).
export const HELP_SECTIONS: HelpSection[] = [
  dashboard,
  vendas,
  compras,
  comparativo,
  prospeccao,
  produtos,
  estoque,
  clientes,
  fornecedores,
  vendedores,
  dre,
  receber,
  pagar,
  importacao,
];

export const HELP_GROUPS: string[] = ["Visão", "Catálogo", "Financeiro", "Operação"];
