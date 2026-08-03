import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { UsersManager } from "@/components/users/users-manager";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin" && !session.isMaster) redirect("/dashboard");

  return (
    <div>
      <PageHeader
        eyebrow="Sua empresa"
        title="Usuários"
        description="Convide colegas, ative/inative acessos e controle quais menus cada um enxerga."
      />
      <UsersManager />
    </div>
  );
}
