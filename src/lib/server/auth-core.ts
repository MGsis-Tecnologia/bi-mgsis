import { SignJWT, jwtVerify } from "jose";

// Núcleo de JWT sem dependências de next/headers ou next/server, para poder
// ser importado tanto pelo Node runtime (auth.ts) quanto pelo Edge runtime
// (middleware.ts) sem quebrar o bundle.

export const SESSION_COOKIE = "mgsis_session";
const SESSION_DAYS = 30;

export interface SessionPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
  /** Id da Empresa (no catalog) cujo banco esta sessão está acessando. */
  empresaId: number;
  /** true = usuário master do sistema (bypassa a senha de qualquer empresa). */
  isMaster: boolean;
  /**
   * Menus liberados (chaves de src/lib/menu-catalog.ts), só relevante quando
   * role === "user". Ausente/indefinido para "admin"/master = enxerga tudo.
   * Embutido no JWT (não consultado por request) pra o proxy.ts (Edge) poder
   * checar sem acessar banco — mudanças de permissão só valem no próximo login.
   */
  allowedMenus?: string[];
}

function secret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (raw) return new TextEncoder().encode(raw.slice(0, 64).padEnd(32, "x"));

  // Em produção, AUTH_SECRET é obrigatório — sem ele, sessões assinadas com um
  // segredo derivado do DATABASE_URL quebram na hora em que a connection string
  // mudar (ex: rotação de senha do banco, ou futuramente troca de tenant).
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET não definido. Configure a variável de ambiente AUTH_SECRET antes de subir em produção (veja .env.example)."
    );
  }

  // Em desenvolvimento, cai num fallback pra não travar o `next dev` de quem
  // ainda não configurou — mas já avisa no console.
  console.warn(
    "⚠️  AUTH_SECRET não definido — usando fallback de desenvolvimento (inseguro). Configure AUTH_SECRET no .env.local."
  );
  const raw2 = process.env.DATABASE_URL || "dev-insecure-fallback";
  return new TextEncoder().encode(raw2.slice(0, 64).padEnd(32, "x"));
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 86_400;
