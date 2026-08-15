import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "@/lib/server/auth-core";
import { isMenuKey } from "@/lib/menu-catalog";

// Rotas acessíveis sem sessão. "/" e "/master/bootstrap" já se autoprotegem
// por regra de negócio própria (só funcionam com o catalog vazio); "/ativar"
// se autoprotege pelo próprio token de convite (single-use, expira). Aqui só
// precisam ficar fora do bloqueio genérico de sessão.
//
// "/api/ingest/" entra pelo mesmo motivo, e não por ser aberta: quem chama é o
// servidor do ERP do cliente, que não tem cookie de sessão. Ela se autoprotege
// com `Authorization: Bearer <integration_token>`, conferido em
// `lib/server/ingest/auth.ts` — e é o token que decide em qual banco escrever,
// então não há como um cliente alcançar os dados de outro.
const PUBLIC_EXACT = new Set(["/", "/login", "/health", "/master/bootstrap", "/ativar"]);
const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/db/status",
  "/api/master/bootstrap",
  "/api/ativar",
  "/api/ingest/",
];

/**
 * Rotas que saem do matcher por TAMANHO, e não por serem públicas — ver a nota
 * no `config` no fim do arquivo. Elas nem chegam aqui; a lista existe para que
 * quem mexer no matcher saiba que a proteção delas está no próprio handler.
 */
export const FORA_POR_TAMANHO = ["/api/ingest/", "/api/importacao"];

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

// `/api/ingest/` e o POST de `/api/importacao` ficam FORA do matcher, não só na
// lista de públicas. O motivo é tamanho: quando há proxy configurado, o Next
// bufferiza o corpo da requisição e aplica `proxyClientMaxBodySize` (10 MB por
// padrão) — a foto de estoque tem 21 MB e um mês de vendas, 12 MB, então ambos
// eram recusados com um erro de JSON enganoso.
//
// Na importação por arquivo é pior, porque o corte é SILENCIOSO: o upload de
// 1,4 milhão de linhas chegava com exatos 10.485.760 bytes, o parser lia as
// 53.996 linhas que couberam e o job terminava "concluído". O que denunciou foi
// o `bytes` do import_jobs — 10 MiB redondos em dois arquivos de tamanhos
// diferentes.
//
// Passar 245 MB por um buffer não é opção nem com o limite aumentado: a rota
// existe para escrever o upload em disco em streaming. Fora do matcher não há
// buffer nem limite. As duas rotas se autoprotegem — `/api/ingest/` pelo Bearer
// do token de integração, `/api/importacao` pelo `getSession()` na primeira
// linha do handler.
//
// `/api/importacao/<id>` (o progresso) continua passando pelo proxy: é um GET
// minúsculo e não ganha nada em sair.
export const config = {
  matcher: [
    "/((?!api/ingest/|api/importacao$|_next/static|_next/image|favicon.ico|logo-mgsis.png|teste_mgsis.csv).*)",
  ],
};
