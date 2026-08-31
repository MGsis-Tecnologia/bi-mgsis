import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PasswordForm } from "@/components/settings/password-form";

export const dynamic = "force-dynamic";

// Ao contrário da página de SMTP ao lado, esta NÃO é exclusiva do master: todo
// mundo que tem senha pode trocar a própria — master, admin de empresa e
// usuário comum. A rota decide sozinha em qual banco gravar (ver
// /api/settings/password).
export default async function SenhaSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div>
      <PageHeader
        eyebrow="Sua conta"
        title="Senha"
        description="Troque a senha de acesso desta conta."
      />
      <PasswordForm />
    </div>
  );
}
