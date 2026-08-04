import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { SmtpForm } from "@/components/settings/smtp-form";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Exclusiva do master: a conta SMTP é ÚNICA para todo o sistema (é dela que
  // saem convites e notificações de todas as empresas), então admin de empresa
  // não configura nem enxerga. Mesmo critério em /api/settings/smtp e .../test.
  if (!session.isMaster) redirect("/dashboard");

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
