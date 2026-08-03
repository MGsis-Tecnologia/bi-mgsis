import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SemAcessoPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold text-foreground">Nenhum acesso liberado</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Sua conta ainda não tem nenhum menu liberado. Fale com o administrador da sua empresa
        para que ele libere o acesso necessário.
      </p>
    </div>
  );
}
