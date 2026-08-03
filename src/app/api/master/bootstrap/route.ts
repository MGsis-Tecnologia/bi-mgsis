import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { getDatabaseUrl, getDbNameFromUrl } from "@/lib/server/db-config";
import { signToken, setSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuração inicial do catalog: registra a empresa atual (a que já roda
// nesta DATABASE_URL) e cria o primeiro usuário master do sistema. Só
// funciona uma vez — enquanto não existir nenhuma Empresa nem MasterUser —
// mesmo padrão de auto-bloqueio já usado em /api/auth/register pro tenant.
export async function POST(req: NextRequest) {
  let cnpjRucRaw: string, nomeEmpresa: string, masterName: string, email: string, password: string;
  try {
    const body = (await req.json()) as {
      cnpjRuc?: string;
      nomeEmpresa?: string;
      masterName?: string;
      email?: string;
      password?: string;
    };
    cnpjRucRaw = body.cnpjRuc ?? "";
    nomeEmpresa = (body.nomeEmpresa ?? "").trim();
    masterName = (body.masterName ?? "").trim();
    email = (body.email ?? "").trim().toLowerCase();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const cnpjRuc = cnpjRucRaw.replace(/\D/g, "");
  if (!cnpjRuc || !nomeEmpresa || !masterName || !email || password.length < 6) {
    return NextResponse.json(
      { error: "Preencha CNPJ/RUC, nome da empresa, nome do master, e-mail e senha (mínimo 6 caracteres)" },
      { status: 400 }
    );
  }

  const catalog = await getCatalogPrisma();

  const [empresaCount, masterCount] = await Promise.all([
    catalog.empresa.count(),
    catalog.masterUser.count(),
  ]);
  if (empresaCount > 0 || masterCount > 0) {
    return NextResponse.json(
      { error: "Configuração inicial não permitida: o catalog já foi configurado" },
      { status: 403 }
    );
  }

  const currentUrl = getDatabaseUrl();
  if (!currentUrl) {
    return NextResponse.json({ error: "DATABASE_URL não configurada" }, { status: 500 });
  }
  const dbName = getDbNameFromUrl(currentUrl);

  const passwordHash = await bcrypt.hash(password, 12);

  const [empresa, master] = await catalog.$transaction([
    catalog.empresa.create({
      data: { cnpjRuc, nome: nomeEmpresa, dbName, status: "ativa", emailMaster: email },
    }),
    catalog.masterUser.create({
      data: { email, name: masterName, passwordHash },
    }),
  ]);

  const token = await signToken({
    userId: master.id,
    email: master.email,
    name: master.name,
    role: "master",
    empresaId: empresa.id,
    isMaster: true,
  });

  return setSessionCookie(NextResponse.json({ ok: true }), token);
}
