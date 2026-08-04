import type { NextRequest } from "next/server";

/**
 * URL pública do app, usada pra montar links absolutos em e-mail (convite de
 * empresa/usuário, redefinição de senha). Atrás de um proxy reverso (Coolify/
 * Traefik), `req.nextUrl.origin` reflete o Host que chega DENTRO do container
 * — em geral o endereço interno que o Next escuta (`0.0.0.0:3000`), não o
 * domínio público real. Por isso prioriza `APP_URL` explícita; só cai pro
 * origin da requisição como fallback (funciona bem em dev local, sem proxy).
 */
export function getAppUrl(req: NextRequest): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return req.nextUrl.origin;
}
