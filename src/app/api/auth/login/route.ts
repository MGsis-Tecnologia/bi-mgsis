import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/server/db";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { buildTenantUrl } from "@/lib/server/db-config";
import { signToken, setSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_ERROR = "CNPJ/RUC, e-mail ou senha incorretos";

export async function POST(req: NextRequest) {
  let cnpjRucRaw: string, email: string, password: string;
  try {
    const body = (await req.json()) as { cnpjRuc?: string; email?: string; password?: string };
    cnpjRucRaw = body.cnpjRuc ?? "";
    email = (body.email ?? "").trim().toLowerCase();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const cnpjRuc = cnpjRucRaw.replace(/\D/g, "");
  if (!cnpjRuc || !email || !password) {
    return NextResponse.json({ error: "Informe CNPJ/RUC, e-mail e senha" }, { status: 400 });
  }

  // Mesma mensagem genérica em qualquer ponto de falha (evita enumeração de
  // CNPJ/RUC cadastrado, e-mail existente, etc).
  const invalid = () => NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });

  const catalog = await getCatalogPrisma();
  const empresa = await catalog.empresa.findUnique({ where: { cnpjRuc } });

  // 1. Usuário master: a senha bate contra MasterUser (catalog), independente
  //    da empresa digitada — o CNPJ/RUC só decide em qual banco a sessão entra.
  const master = await catalog.masterUser.findUnique({ where: { email } });
  if (master && (await bcrypt.compare(password, master.passwordHash))) {
    if (!empresa) return invalid();

    const token = await signToken({
      userId: master.id,
      email: master.email,
      name: master.name || "Master",
      role: "master",
      empresaId: empresa.id,
      isMaster: true,
    });
    return setSessionCookie(NextResponse.json({ ok: true }), token);
  }

  // 2. Usuário comum: precisa existir dentro do banco da própria empresa, que
  //    por sua vez precisa estar ativa (master bypassa essa checagem acima).
  if (!empresa || empresa.status !== "ativa") return invalid();

  const tenantDb = await getPrisma(buildTenantUrl(empresa.dbName));
  const user = await tenantDb.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return invalid();
  if (!user.isActive) return invalid();

  // "admin" enxerga tudo (allowedMenus fica de fora do payload); "user" só
  // enxerga os menus com uma linha em MenuPermission (nega por padrão).
  let allowedMenus: string[] | undefined;
  if (user.role !== "admin") {
    const permissions = await tenantDb.menuPermission.findMany({ where: { userId: user.id } });
    allowedMenus = permissions.map((p) => p.menuKey);
  }

  const token = await signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    empresaId: empresa.id,
    isMaster: false,
    allowedMenus,
  });

  return setSessionCookie(NextResponse.json({ ok: true }), token);
}
