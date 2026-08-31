import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getPrisma } from "@/lib/server/db";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { buildTenantUrl } from "@/lib/server/db-config";
import { consomeLimite } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mesmo mínimo do /api/ativar — as duas rotas gravam senha no mesmo campo, e
// um mínimo diferente aqui só criaria senhas que a outra tela recusaria.
const MIN_SENHA = 6;

// Custo 12, igual ao /api/ativar e ao /api/master/bootstrap. Hashes de custos
// diferentes convivem sem problema no bcrypt, mas manter um número só evita a
// dúvida futura de "por que este hash é mais barato que aquele".
const BCRYPT_COST = 12;

// Brute force da senha ATUAL por quem já está com a sessão na mão: o cookie
// dá acesso de leitura, mas a troca de senha é o que tomaria a conta de vez.
// Conta tentativa certa também (não só a errada), porque a checagem precisa
// vir ANTES do bcrypt.compare pra de fato barrar — se só a falha contasse, a
// comparação continuaria rodando e a senha certa passaria na milésima tentativa.
//
// De propósito NÃO bloqueia a conta como as 3 tentativas do login: lá o custo
// de errar é do dono da senha; aqui, quem tivesse o cookie roubado poderia
// trancar o dono pra fora de graça.
const LIMITE_TENTATIVAS = { max: 5, janelaMs: 15 * 60_000 };

const bodySchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(MIN_SENHA),
});

// PUT /api/settings/password — o usuário logado troca a PRÓPRIA senha,
// confirmando a atual. Vale para os dois tipos de conta que existem no
// sistema, que moram em bancos diferentes:
//
//   master  → master_users, no catalog (não pertence a nenhuma empresa)
//   demais  → users, no banco do tenant da empresa da sessão
//
// Quem decide é o `isMaster` do próprio JWT, o mesmo critério que o login usa
// pra escolher contra qual hash comparar a senha (ver /api/auth/login).
//
// Note que trocar a senha NÃO invalida sessões já abertas em outros
// dispositivos: o JWT é auto-contido e vale 30 dias, sem lista de revogação.
// Encerrar as outras sessões pediria versionar o token (um contador na conta,
// conferido a cada request) — fora do escopo desta rota.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: `Informe a senha atual e uma nova senha de pelo menos ${MIN_SENHA} caracteres.` },
      { status: 400 }
    );
  }
  const { senhaAtual, novaSenha } = parsed;

  if (novaSenha === senhaAtual) {
    return NextResponse.json(
      { error: "A nova senha precisa ser diferente da atual." },
      { status: 400 }
    );
  }

  const escopo = session.isMaster ? "master" : `empresa:${session.empresaId}`;
  const cota = consomeLimite(`senha:${escopo}:${session.userId}`, LIMITE_TENTATIVAS);
  if (!cota.permitido) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(cota.esperaSegundos) } }
    );
  }

  const senhaIncorreta = () =>
    NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });

  // A sessão pode ter sobrevivido à conta (JWT de 30 dias): 401 em vez de 500
  // pra a tela mandar refazer o login em vez de mostrar erro de servidor.
  const sessaoOrfa = () =>
    NextResponse.json({ error: "Sessão inválida. Faça login novamente." }, { status: 401 });

  // Só depois de conferir a atual: hashear com custo 12 é caro de propósito,
  // e fazer isso antes da comparação dobrava o trabalho de toda tentativa errada.
  const hashNova = () => bcrypt.hash(novaSenha, BCRYPT_COST);
  const catalog = await getCatalogPrisma();

  if (session.isMaster) {
    const master = await catalog.masterUser.findUnique({ where: { id: session.userId } });
    if (!master) return sessaoOrfa();
    if (!(await bcrypt.compare(senhaAtual, master.passwordHash))) return senhaIncorreta();

    await catalog.masterUser.update({
      where: { id: master.id },
      data: { passwordHash: await hashNova() },
    });
    return NextResponse.json({ ok: true });
  }

  const empresa = await catalog.empresa.findUnique({ where: { id: session.empresaId } });
  if (!empresa) return sessaoOrfa();

  const tenantDb = await getPrisma(buildTenantUrl(empresa.dbName));
  const user = await tenantDb.user.findUnique({ where: { id: session.userId } });
  if (!user) return sessaoOrfa();

  // Conta desativada (pelo admin ou pelas 3 tentativas erradas) não se
  // conserta por aqui: continua dependendo do link do gestor, como no login.
  if (!user.isActive) {
    return NextResponse.json(
      { error: "Conta bloqueada. Peça ao administrador da sua empresa para liberar o acesso." },
      { status: 403 }
    );
  }

  if (!(await bcrypt.compare(senhaAtual, user.passwordHash))) return senhaIncorreta();

  await tenantDb.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashNova(), failedLoginAttempts: 0 },
  });

  return NextResponse.json({ ok: true });
}
