import { redirect } from "next/navigation";
import { getDatabaseUrl } from "@/lib/server/db-config";
import { testConnection, getPrisma } from "@/lib/server/db";
import { getSession } from "@/lib/server/auth";
import { DbError } from "@/components/layout/db-error";

export const dynamic = "force-dynamic";

export default async function Home() {
  const url = getDatabaseUrl();
  if (!url) return <DbError />;

  try {
    await testConnection(url);
  } catch (err) {
    return <DbError detail={`Falha ao conectar: ${(err as Error).message}`} />;
  }

  // Sessão válida → vai direto pro dashboard
  const session = await getSession();
  if (session) redirect("/dashboard");

  // Nenhum usuário cadastrado → cadastro do primeiro admin
  const db = await getPrisma();
  const count = await db.user.count();
  if (count === 0) redirect("/register");

  redirect("/login");
}
