import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { SmtpForm } from "@/components/settings/smtp-form";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Tela restrita ao admin — hoje o único papel existente; quando o cadastro
  // multi-empresa entrar, isso passa a valer só para o master do sistema.
  if (session.role !== "admin") redirect("/dashboard");

  return (
    <div>
      <PageHeader
        eyebrow="Configurações"
        title="E-mail (SMTP)"
        description="Conta usada para o envio de e-mails do sistema — convites, notificações e alertas."
      />
      <SmtpForm />
    </div>
  );
}
