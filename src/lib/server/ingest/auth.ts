import type { PrismaClient } from "@prisma/client";
import { getCatalogPrisma } from "../catalog-db";
import { getPrisma } from "../db";
import { buildTenantUrl } from "../db-config";
import { hashToken } from "../tokens";

/**
 * Autenticação da ingestão por API.
 *
 * O ERP não tem cookie de sessão, então esta via é separada da dos usuários:
 * `Authorization: Bearer <token>`, com o token da tabela `integration_tokens`
 * do catalog (só o hash SHA-256 fica guardado).
 *
 * O ponto que importa para o isolamento: **o token identifica a empresa, e é o
 * servidor que decide em qual banco escrever**. O cliente nunca informa o
 * destino, então não há como um token de uma empresa gravar na outra — nem por
 * engano, nem de propósito.
 */

export interface ContextoIngestao {
  /** Moeda padrão da empresa — é o PIVÔ da tabela de câmbio. */
  moedaPadrao: string;
  empresaId: number;
  empresaNome: string;
  db: PrismaClient;
}

export type FalhaAuth =
  | { status: 401; erro: string }
  | { status: 403; erro: string };

export async function autenticaIngestao(
  req: Request
): Promise<ContextoIngestao | FalhaAuth> {
  const cabecalho = req.headers.get("authorization") ?? "";
  const casa = /^Bearer\s+(.+)$/i.exec(cabecalho.trim());
  if (!casa) {
    return {
      status: 401,
      erro: "Falta o cabeçalho Authorization: Bearer <token de integração>.",
    };
  }

  const token = casa[1]!.trim();
  // Formato conhecido antes de ir ao banco: 32 bytes em hex.
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    return { status: 401, erro: "Token de integração inválido." };
  }

  const catalog = await getCatalogPrisma();
  const registro = await catalog.integrationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { empresa: true },
  });

  if (!registro || registro.revokedAt) {
    // Mesma mensagem para token inexistente e revogado: dizer qual dos dois
    // ajudaria alguém a descobrir tokens válidos por tentativa.
    return { status: 401, erro: "Token de integração inválido ou revogado." };
  }

  const empresa = registro.empresa;
  if (empresa.status !== "ativa") {
    return {
      status: 403,
      erro: `A empresa "${empresa.nome}" está ${empresa.status}. A ingestão está bloqueada.`,
    };
  }

  return {
    empresaId: empresa.id,
    empresaNome: empresa.nome,
    moedaPadrao: empresa.moedaPadrao,
    db: await getPrisma(buildTenantUrl(empresa.dbName)),
  };
}

export function ehFalha(r: ContextoIngestao | FalhaAuth): r is FalhaAuth {
  return "erro" in r;
}
