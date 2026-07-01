import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Nunca bloquear setup, APIs e assets estáticos
  if (
    pathname.startsWith("/setup") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Cookie setado pelo /api/db/setup após conexão bem-sucedida.
  // A verificação real de conectividade acontece nos server components
  // (page.tsx e dashboard/layout.tsx) — o proxy apenas bloqueia acesso
  // a rotas protegidas quando o setup ainda não foi concluído.
  const configured = req.cookies.get("db_configured")?.value === "1";
  if (configured) return NextResponse.next();

  // DATABASE_URL no env → deixa passar (server components farão o teste real)
  if (process.env.DATABASE_URL) return NextResponse.next();

  return NextResponse.redirect(new URL("/setup", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
