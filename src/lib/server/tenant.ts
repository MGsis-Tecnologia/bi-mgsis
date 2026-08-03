import type { PrismaClient } from "@prisma/client";
import type { SessionPayload } from "./auth-core";
import { getCatalogPrisma } from "./catalog-db";
import { getPrisma } from "./db";
import { buildTenantUrl } from "./db-config";

/**
 * Resolve o client Prisma do banco da EMPRESA da sessão (session.empresaId),
 * não o DATABASE_URL padrão do processo. Toda rota que lida com dados de
 * tenant (usuários, vendas, configurações, etc.) deve usar isso — chamar
 * getPrisma() sem argumento sempre volta pro banco default, o que vazaria
 * dados entre empresas assim que houver mais de um tenant.
 */
export async function getTenantPrisma(session: SessionPayload): Promise<PrismaClient> {
  const catalog = await getCatalogPrisma();
  const empresa = await catalog.empresa.findUnique({ where: { id: session.empresaId } });
  if (!empresa) {
    throw new Error("Empresa da sessão não encontrada no catalog.");
  }
  return getPrisma(buildTenantUrl(empresa.dbName));
}
