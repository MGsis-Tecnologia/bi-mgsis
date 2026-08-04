import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "@/lib/server/auth-core";
import { isMenuKey } from "@/lib/menu-catalog";

// Rotas acessíveis sem sessão. "/" e "/master/bootstrap" já se autoprotegem
// por regra de negócio própria (só funcionam com o catalog vazio); "/ativar"
// se autoprotege pelo próprio token de convite (single-use, expira). Aqui só
// precisam ficar fora do bloqueio genérico de sessão.
const PUBLIC_EXACT = new Set(["/", "/login", "/health", "/master/bootstrap", "/ativar"]);
const PUBLIC_PREFIXES = ["/api/auth/", "/api/db/status", "/api/master/bootstrap", "/api/ativar"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Permissão de menu por usuário (seção 5.1 do plano) — só vale pra role
  // "user"; "admin" e master sempre enxergam tudo. A checagem embutida no
  // JWT evita consulta a banco aqui (proxy roda fora do runtime Node/Prisma).
  if (session.role === "user" && !session.isMaster && isMenuKey(pathname)) {
    const allowed = session.allowedMenus ?? [];
    if (!allowed.includes(pathname)) {
      const fallback = allowed[0] ?? "/sem-acesso";
      if (pathname !== fallback) {
        return NextResponse.redirect(new URL(fallback, req.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-mgsis.png|teste_mgsis.csv).*)"],
};
