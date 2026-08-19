"use client";

import * as React from "react";
import { Loader2, MailCheck, X } from "lucide-react";
import { useTranslation } from "@/lib/hooks/use-translation";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pré-preenchidos com o que já foi digitado no login. */
  cnpjRucInicial: string;
  emailInicial: string;
}

// Modal em vez de página própria de propósito: o CNPJ/RUC e o e-mail já estão
// digitados no login ao lado, e passá-los por querystring deixaria o e-mail
// registrado no histórico do navegador e nos logs de acesso.
export function ForgotPasswordDialog({ open, onClose, cnpjRucInicial, emailInicial }: Props) {
  const { t } = useTranslation();
  const [cnpjRuc, setCnpjRuc] = React.useState(cnpjRucInicial);
  const [email, setEmail] = React.useState(emailInicial);
  const [loading, setLoading] = React.useState(false);
  const [enviado, setEnviado] = React.useState(false);
  const [error, setError] = React.useState("");

  // Reabrir o modal reaproveita o que estiver no formulário de login agora, e
  // limpa o estado do envio anterior.
  React.useEffect(() => {
    if (!open) return;
    setCnpjRuc(cnpjRucInicial);
    setEmail(emailInicial);
    setEnviado(false);
    setError("");
  }, [open, cnpjRucInicial, emailInicial]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpjRuc, email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      // A rota responde ok mesmo quando não existe conta — é proposital, pra
      // não confirmar de fora quais e-mails estão cadastrados. O 429 do
      // limitador é a única recusa que chega até aqui.
      if (!res.ok || !data.ok) { setError(data.error ?? t("login.forgot.error")); return; }
      setEnviado(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("login.forgot.close")}
          className="absolute right-4 top-4 text-slate-400 transition-colors hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>

        {enviado ? (
          <div className="space-y-4 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
              <MailCheck className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="font-serif text-xl font-bold text-slate-900">
              {t("login.forgot.sent.title")}
            </h2>
            <p className="text-sm text-slate-600">{t("login.forgot.sent.description")}</p>
            <p className="text-xs text-slate-500">{t("login.forgot.sent.blocked")}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              {t("login.forgot.sent.back")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1 pr-6">
              <h2 className="font-serif text-xl font-bold text-slate-900">
                {t("login.forgot.title")}
              </h2>
              <p className="text-sm text-slate-600">{t("login.forgot.description")}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {t("login.forgot.cnpj.label")}
              </label>
              <input
                type="text"
                value={cnpjRuc}
                onChange={(e) => setCnpjRuc(e.target.value)}
                placeholder="00.000.000/0000-00"
                required
                disabled={loading}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {t("login.form.email.label")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                disabled={loading}
                autoFocus
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 font-semibold text-white transition-all hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-75"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("login.forgot.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
