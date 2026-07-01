import { Database } from "lucide-react";

/**
 * Tela exibida quando DATABASE_URL não está configurado (ou a conexão falha).
 * O banco é configurado exclusivamente via variável de ambiente — não há
 * mais tela de /setup.
 */
export function DbError({ detail }: { detail?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-negative/10 ring-1 ring-negative/20">
          <Database className="h-7 w-7 text-negative" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Banco de dados não configurado
          </h1>
          <p className="text-sm text-muted-foreground">
            Defina a variável de ambiente{" "}
            <span className="font-mono">DATABASE_URL</span> com a string de
            conexão PostgreSQL e reinicie a aplicação.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4 text-left">
          <p className="text-xs font-medium text-foreground">Exemplo</p>
          <p className="break-all font-mono text-[11px] text-muted-foreground">
            DATABASE_URL=postgresql://usuario:senha@host:5432/mgsis?schema=public
          </p>
        </div>

        {detail && (
          <p className="break-all text-[11px] text-negative">{detail}</p>
        )}
      </div>
    </div>
  );
}
