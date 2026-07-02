import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SESSION_COOKIE = "mgsis_session";
const SESSION_DAYS = 30;

export interface SessionPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
}

function secret(): Uint8Array {
  // AUTH_SECRET env explícito tem prioridade; fallback no DATABASE_URL
  // para que as sessões sobrevivam a reinicios sem config extra.
  const raw =
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "dev-insecure-fallback";
  return new TextEncoder().encode(raw.slice(0, 64).padEnd(32, "x"));
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

/** Lê a sessão do cookie na requisição atual (Server Component / Route Handler). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** Seta o cookie de sessão numa NextResponse. */
export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_DAYS * 86_400,
    path: "/",
  });
  return res;
}

/** Remove o cookie de sessão. */
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
