"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck, KeyRound } from "lucide-react";

export default function AtivarPage() {
  return (
    <React.Suspense fallback={null}>
      <AtivarForm />
    </React.Suspense>
  );
}

// O que o link é, segundo GET /api/ativar. Uma ativação de conta nova e uma
// redefinição de senha caem na mesma tela, mas não pedem a mesma coisa nem
// falam a mesma língua com quem chegou.
interface Convite {
  kind: "invite" | "self_reset";
  email: string;
  precisaNome: boolean;
}

function AtivarForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [convite, setConvite] = React.useState<Convite | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [form, setForm] = React.useState({ name: "", password: "", confirm: "" });
  const [showPw, setShowPw] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!token) { setCarregando(false); return; }
    let ativo = true;
    (async () => {
      try {
        const res = await fetch(`/api/ativar?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as Partial<Convite> & { ok?: boolean; error?: string };
        if (!ativo) return;
        if (!res.ok || !data.ok) { setError(data.error ?? "Link inválido ou expirado"); return; }
        setConvite({
          kind: data.kind ?? "invite",
          email: data.email ?? "",
          precisaNome: data.precisaNome ?? true,
        });
      } catch (err) {
        if (ativo) setError((err as Error).message);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, [token]);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (form.password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ativar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: form.name, password: form.password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) { setError(data.error ?? "Erro ao definir a senha"); return; }
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Aviso texto="Link inválido — falta o token na URL." />
    );
  }

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Link já usado, expirado ou de conta que não pode mais ser redefinida por
  // aqui: não adianta mostrar o formulário.
  if (!convite) {
    return (
      <Aviso
        texto={error || "Link inválido ou expirado."}
        dica="Peça um novo link em “Esqueci minha senha”, na tela de login."
      />
    );
  }

  const redefinindo = convite.kind === "self_reset";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
            {redefinindo ? (
              <KeyRound className="h-7 w-7 text-accent" />
            ) : (
              <ShieldCheck className="h-7 w-7 text-accent" />
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {redefinindo ? "Criar uma nova senha" : "Ativar sua conta"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {redefinindo
              ? "Escolha a nova senha da sua conta no MGSIS Analytics."
              : "Defina seu nome e uma senha para começar a usar o MGSIS Analytics."}
          </p>
          {convite.email && (
            <p className="text-xs text-muted-foreground/80">{convite.email}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {convite.precisaNome && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Seu nome</label>
              <input
                type="text"
                value={form.name}
                onChange={set("name")}
                placeholder="Nome completo"
                required
                disabled={loading}
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {redefinindo ? "Nova senha" : "Senha"}
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                placeholder="Mínimo 6 caracteres"
                required
                disabled={loading}
                autoComplete="new-password"
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Confirmar senha</label>
            <input
              type={showPw ? "text" : "password"}
              value={form.confirm}
              onChange={set("confirm")}
              placeholder="Repita a senha"
              required
              disabled={loading}
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading
              ? redefinindo ? "Salvando…" : "Ativando…"
              : redefinindo ? "Salvar e entrar" : "Ativar e entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Aviso({ texto, dica }: { texto: string; dica?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm space-y-2 text-center">
        <p className="text-sm text-negative">{texto}</p>
        {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
        <a href="/login" className="inline-block text-xs text-accent hover:underline">
          Voltar ao login
        </a>
      </div>
    </div>
  );
}
