import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/db";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { buildTenantUrl } from "@/lib/server/db-config";
import { generateToken } from "@/lib/server/tokens";
import { sendMail } from "@/lib/server/mailer";
import { getAppUrl } from "@/lib/server/app-url";
import { consomeLimite, clientIp } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Curto de propósito: o link do admin (POST /api/users/[id]/reset-link) vale 7
// dias porque é entregue por uma pessoa a outra e pode esperar. Este chega
// sozinho na caixa de quem acabou de clicar no botão — uma hora sobra.
const RESET_EXPIRATION_MS = 60 * 60_000;

// Duas cotas com propósitos diferentes: a por conta evita encher a caixa de
// entrada de um usuário específico; a por IP evita que alguém varra uma lista
// de e-mails atrás de qual existe (o retorno é sempre o mesmo, mas o tempo de
// resposta e o tráfego de saída não seriam).
const LIMITE_POR_CONTA = { max: 3, janelaMs: 60 * 60_000 };
const LIMITE_POR_IP = { max: 10, janelaMs: 60 * 60_000 };

// POST /api/auth/forgot-password — rota PÚBLICA (sem sessão): o usuário pede o
// próprio link de redefinição a partir da tela de login.
//
// Duas regras moldam tudo aqui:
//
// 1. A resposta é SEMPRE `{ ok: true }`, exista ou não a empresa/o usuário, e
//    mesmo se o SMTP falhar. Qualquer diferença de retorno viraria um oráculo
//    de "este CNPJ/RUC está cadastrado" ou "este e-mail tem conta aqui" — a
//    mesma razão da mensagem genérica em /api/auth/login.
// 2. O token sai com kind "self_reset", que /api/ativar trata como "só troca a
//    senha": não cria usuário, não destrava conta inativa e não mexe no status
//    da empresa. Quem foi bloqueado pelas 3 tentativas erradas continua
//    dependendo do gestor — este botão não é uma porta dos fundos pra isso.
export async function POST(req: NextRequest) {
  let cnpjRucRaw: string, email: string;
  try {
    const body = (await req.json()) as { cnpjRuc?: string; email?: string };
    cnpjRucRaw = body.cnpjRuc ?? "";
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const cnpjRuc = cnpjRucRaw.replace(/\D/g, "");
  if (!cnpjRuc || !email) {
    return NextResponse.json({ error: "Informe CNPJ/RUC e e-mail" }, { status: 400 });
  }

  // O 429 é a ÚNICA resposta que foge do `{ ok: true }` genérico, e pode: ele
  // não diz nada sobre a conta existir — só sobre quantas vezes este par
  // e-mail/IP já bateu na porta.
  const cotas = [
    consomeLimite(`forgot:conta:${cnpjRuc}:${email}`, LIMITE_POR_CONTA),
    consomeLimite(`forgot:ip:${clientIp(req)}`, LIMITE_POR_IP),
  ];
  const bloqueada = cotas.find((c) => !c.permitido);
  if (bloqueada) {
    return NextResponse.json(
      { error: "Muitas solicitações. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(bloqueada.esperaSegundos) } }
    );
  }

  const ok = () => NextResponse.json({ ok: true });

  try {
    const catalog = await getCatalogPrisma();
    const empresa = await catalog.empresa.findUnique({ where: { cnpjRuc } });
    if (!empresa || empresa.status !== "ativa") return ok();

    const tenantDb = await getPrisma(buildTenantUrl(empresa.dbName));
    const user = await tenantDb.user.findUnique({ where: { email } });

    // Conta inativa não recebe link: é exatamente o caso "bloqueado por 3
    // tentativas" que só o admin libera. Silenciosamente, pra não revelar por
    // fora que a conta existe e está travada.
    if (!user || !user.isActive) return ok();

    // Um pedido novo invalida os anteriores ainda não usados — senão cada
    // clique deixaria mais um link vivo na caixa de entrada.
    await catalog.inviteToken.updateMany({
      where: { empresaId: empresa.id, email: user.email, kind: "self_reset", usedAt: null },
      data: { usedAt: new Date() },
    });

    const reset = generateToken();
    await catalog.inviteToken.create({
      data: {
        empresaId: empresa.id,
        tokenHash: reset.hash,
        email: user.email,
        role: user.role,
        kind: "self_reset",
        expiresAt: new Date(Date.now() + RESET_EXPIRATION_MS),
      },
    });

    const link = `${getAppUrl(req)}/ativar?token=${reset.token}`;

    await sendMail({
      to: user.email,
      subject: "Redefinição de senha — MGSIS Analytics",
      html: `<p>Você solicitou uma nova senha para a sua conta no MGSIS Analytics.</p>
             <p><a href="${link}">Clique aqui para criar uma nova senha</a> (link válido por 1 hora).</p>
             <p style="color:#888;font-size:12px">Se não foi você, ignore este e-mail — sua senha atual continua valendo.</p>`,
    });
  } catch (err) {
    // SMTP fora do ar, empresa com banco inacessível, etc. Nada disso pode
    // virar resposta diferente pro cliente; fica no log do servidor.
    console.error("[forgot-password]", (err as Error).message);
  }

  return ok();
}
