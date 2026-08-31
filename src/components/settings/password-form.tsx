"use client";

import * as React from "react";
import { KeyRound, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Mesmo mínimo de /api/settings/password e /api/ativar. Repetido aqui só pra
// avisar antes do envio — quem manda na regra é o servidor.
const MIN_SENHA = 6;

const EMPTY_FORM = { senhaAtual: "", novaSenha: "", confirmacao: "" };

export function PasswordForm() {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // A confirmação existe só na tela: é erro de digitação, não regra de
  // negócio, e mandar as duas pro servidor não acrescentaria nada.
  const divergem = form.confirmacao.length > 0 && form.novaSenha !== form.confirmacao;
  const curta = form.novaSenha.length > 0 && form.novaSenha.length < MIN_SENHA;
  const podeSalvar =
    !saving &&
    form.senhaAtual.length > 0 &&
    form.novaSenha.length >= MIN_SENHA &&
    form.novaSenha === form.confirmacao;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual: form.senhaAtual, novaSenha: form.novaSenha }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessage({ type: "error", text: data.error ?? "Erro ao alterar a senha" });
        return;
      }
      // Limpa os três campos: deixar a senha nova no formulário só a manteria
      // visível na tela de quem se levantou da mesa.
      setForm(EMPTY_FORM);
      setMessage({ type: "ok", text: "Senha alterada com sucesso." });
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Alterar senha</CardTitle>
            <CardDescription>
              Confirme a senha atual e escolha uma nova, com pelo menos {MIN_SENHA} caracteres.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Senha atual</label>
              <Input
                type="password"
                autoComplete="current-password"
                value={form.senhaAtual}
                onChange={(e) => update("senhaAtual", e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nova senha</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={form.novaSenha}
                onChange={(e) => update("novaSenha", e.target.value)}
                required
                disabled={saving}
              />
              {curta && (
                <p className="mt-1.5 text-xs text-red-600">
                  A nova senha precisa ter pelo menos {MIN_SENHA} caracteres.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Repita a nova senha</label>
              <Input
                type="password"
                autoComplete="new-password"
                value={form.confirmacao}
                onChange={(e) => update("confirmacao", e.target.value)}
                required
                disabled={saving}
              />
              {divergem && <p className="mt-1.5 text-xs text-red-600">As senhas não conferem.</p>}
            </div>

            {message && (
              <p
                className={
                  "rounded-lg border px-4 py-2.5 text-sm " +
                  (message.type === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700")
                }
              >
                {message.text}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={!podeSalvar}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Alterar senha
            </Button>
          </CardFooter>
        </form>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <KeyRound className="h-3 w-3" />
        Sessões já abertas em outros dispositivos continuam válidas após a troca.
      </p>
    </div>
  );
}
