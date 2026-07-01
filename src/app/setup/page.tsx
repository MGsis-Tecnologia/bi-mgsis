"use client";

import * as React from "react";
import { Database, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "testing" | "saving" | "done" | "error";

export default function SetupPage() {
  const router = useRouter();
  const [url, setUrl] = React.useState("");
  const [showUrl, setShowUrl] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setPhase("testing");
    setErrorMsg("");

    try {
      const res = await fetch("/api/db/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "Erro desconhecido");
        setPhase("error");
        return;
      }

      setPhase("done");
      setTimeout(() => router.push("/"), 1200);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  }

  const loading = phase === "testing" || phase === "saving";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
            <Database className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Configurar banco de dados
          </h1>
          <p className="text-sm text-muted-foreground">
            Informe a string de conexão PostgreSQL para persistir os dados importados e compartilhá-los entre todos os acessos.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Connection string (DATABASE_URL)
            </label>
            <div className="relative">
              <input
                type={showUrl ? "text" : "password"}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="postgresql://user:password@host:5432/dbname"
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 pr-10 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                disabled={loading || phase === "done"}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowUrl((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showUrl ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Exemplo: <span className="font-mono">postgresql://admin:senha@db.exemplo.com:5432/mgsis</span>
            </p>
          </div>

          {/* Status feedback */}
          {phase === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-negative/30 bg-negative/10 px-3 py-2.5">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
              <p className="text-xs text-negative">{errorMsg}</p>
            </div>
          )}

          {phase === "done" && (
            <div className="flex items-center gap-2 rounded-lg border border-positive/30 bg-positive/10 px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
              <p className="text-xs text-positive">Conectado! Redirecionando…</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!url.trim() || loading || phase === "done"}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {phase === "done" ? "Conectado!" : loading ? "Testando conexão…" : "Conectar e continuar"}
          </button>
        </form>

        {/* Help */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-xs font-medium text-foreground">Como obter a connection string</p>
          <ul className="space-y-1 text-[11px] text-muted-foreground list-disc list-inside">
            <li>Neon, Supabase, Railway — painel do projeto → Connection string</li>
            <li>Docker local — <span className="font-mono">postgresql://postgres:postgres@localhost:5432/mgsis</span></li>
            <li>Variável de ambiente — defina <span className="font-mono">DATABASE_URL</span> no container para pular esta tela</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
