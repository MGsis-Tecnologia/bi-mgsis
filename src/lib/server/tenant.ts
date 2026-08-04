import type { PrismaClient } from "@prisma/client";
import type { SessionPayload } from "./auth-core";
import { getCatalogPrisma } from "./catalog-db";
import { getPrisma } from "./db";
import { buildTenantUrl } from "./db-config";

/** Lançado quando a empresa da sessão existe mas não está mais ativa. */
export class EmpresaInativaError extends Error {
  constructor(public readonly status: string) {
    super("Esta empresa está suspensa. Fale com o administrador do sistema.");
    this.name = "EmpresaInativaError";
  }
}

/**
 * Resolve o client Prisma do banco da EMPRESA da sessão (session.empresaId),
 * não o DATABASE_URL padrão do processo. Toda rota que lida com dados de
 * tenant (usuários, vendas, configurações, etc.) deve usar isso — chamar
 * getPrisma() sem argumento sempre volta pro banco default, o que vazaria
 * dados entre empresas assim que houver mais de um tenant.
 *
 * É também o ponto onde a suspensão de uma empresa vira corte de acesso real:
 * o JWT vive 30 dias e o proxy não consulta banco, então bloquear só o login
 * deixaria quem já está logado acessando os dados por semanas. Como todas as
 * rotas de dados passam por aqui, checar o status neste ponto derruba a sessão
 * na requisição seguinte à suspensão.
 */
export async function getTenantPrisma(session: SessionPayload): Promise<PrismaClient> {
  const catalog = await getCatalogPrisma();
  const empresa = await catalog.empresa.findUnique({ where: { id: session.empresaId } });
  if (!empresa) {
    throw new Error("Empresa da sessão não encontrada no catalog.");
  }
  // O master administra o sistema — continua entrando mesmo numa empresa
  // suspensa, senão suspender a própria empresa o trancaria pra fora.
  if (empresa.status !== "ativa" && !session.isMaster) {
    throw new EmpresaInativaError(empresa.status);
  }
  return getPrisma(buildTenantUrl(empresa.dbName));
}
