import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { EmpresasManager } from "@/components/master/empresas-manager";

export const dynamic = "force-dynamic";

// Vive sob o route group (dashboard) só pra herdar sidebar + topbar — o grupo
// não entra na URL, então a rota continua sendo /master/empresas. Fora dele a
// tela abria sem menu nenhum e não havia como voltar. O irmão /master/bootstrap
// fica de propósito FORA daqui: roda antes de existir sessão, e este layout
// exige uma.
export default async function MasterEmpresasPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isMaster) redirect("/dashboard");

  return (
    <div>
      <PageHeader
        eyebrow="Administração do sistema"
        title="Empresas"
        description="Cadastre novas empresas — cada uma ganha seu próprio banco de dados e um convite de ativação por e-mail para o responsável."
      />
      <EmpresasManager />
    </div>
  );
}
