import { redirect } from "next/navigation";
import { getDatabaseUrl } from "@/lib/server/db-config";
import { testConnection } from "@/lib/server/db";
import { getSession } from "@/lib/server/auth";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
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

  // Catalog vazio (nenhuma empresa/master ainda) → configuração inicial.
  // Checar o catalog, não a tabela `users` do tenant: um tenant pode ter
  // usuários sem nenhuma empresa vinculada (resquício do fluxo antigo de
  // single-tenant), o que deixaria a sessão inutilizável assim que criada.
  const catalog = await getCatalogPrisma();
  const [empresaCount, masterCount] = await Promise.all([
    catalog.empresa.count(),
    catalog.masterUser.count(),
  ]);
  if (empresaCount === 0 || masterCount === 0) redirect("/master/bootstrap");

  redirect("/login");
}
