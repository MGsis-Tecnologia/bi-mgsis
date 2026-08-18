import { redirect } from "next/navigation";
import { getDatabaseUrl } from "@/lib/server/db-config";
import { testConnection } from "@/lib/server/db";
import { getSession } from "@/lib/server/auth";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DbError } from "@/components/layout/db-error";
import { UsuarioProvider } from "@/components/providers/usuario-provider";
import { MoedaInicial } from "@/components/providers/moeda-inicial";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const url = getDatabaseUrl();
  if (!url) return <DbError />;

  try {
    await testConnection(url);
  } catch (err) {
    return <DbError detail={`Falha ao conectar: ${(err as Error).message}`} />;
  }

  const session = await getSession();
  if (!session) redirect("/login");

  // Empresa suspensa derruba a sessão já aberta. O proxy roda no Edge e não
  // consulta banco, então sem esta checagem quem já estava logado continuaria
  // com o app na tela até o JWT expirar (30 dias). O master é exceção: precisa
  // conseguir entrar pra reativar a empresa.
  const catalog = await getCatalogPrisma();

  // Fallback para tokens antigos sem empresaId: redireciona para login
  if (!session.empresaId) {
    redirect("/login");
  }

  const empresa = await catalog.empresa.findUnique({ where: { id: session.empresaId } });
  if (!session.isMaster && (!empresa || empresa.status !== "ativa")) redirect("/login");

  const initials = session.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <TooltipProvider delayDuration={200}>
      {/* A sessão já está resolvida aqui; o provider evita que cada tela de
          cliente precise buscá-la de novo por uma rota de API. */}
      <UsuarioProvider
        usuario={{
          nome: session.name,
          email: session.email,
          moedaPadrao: empresa?.moedaPadrao ?? "1",
        }}
      >
        <MoedaInicial />
        <div className="flex min-h-screen bg-background">
          <Sidebar isMaster={session.isMaster} role={session.role} allowedMenus={session.allowedMenus} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar user={{ name: session.name, initials }} />
            <main className="flex-1 px-4 md:px-6 lg:px-8 py-6 lg:py-8 max-w-[1440px] w-full mx-auto">
              {children}
            </main>
          </div>
        </div>
      </UsuarioProvider>
    </TooltipProvider>
  );
}
