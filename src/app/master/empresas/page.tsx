import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { EmpresasManager } from "@/components/master/empresas-manager";

export const dynamic = "force-dynamic";

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
