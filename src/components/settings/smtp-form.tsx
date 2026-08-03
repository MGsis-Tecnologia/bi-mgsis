"use client";

import * as React from "react";
import { Loader2, Mail, Save, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SmtpConfigSafe {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  hasPassword: boolean;
  updatedAt: string;
}

const EMPTY_FORM = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  password: "",
  fromName: "MGSIS Analytics",
  fromEmail: "",
};

export function SmtpForm() {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [hasPassword, setHasPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [testTo, setTestTo] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [testMessage, setTestMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/smtp");
        const data = (await res.json()) as { config: SmtpConfigSafe | null };
        if (data.config) {
          const c = data.config;
          setForm({
            host: c.host,
            port: c.port,
            secure: c.secure,
            user: c.user,
            password: "",
            fromName: c.fromName,
            fromEmail: c.fromEmail,
          });
          setHasPassword(c.hasPassword);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessage({ type: "error", text: data.error ?? "Erro ao salvar" });
        return;
      }
      setMessage({ type: "ok", text: "Configuração salva com sucesso." });
      if (form.password) setHasPassword(true);
      setForm((prev) => ({ ...prev, password: "" }));
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestMessage(null);
    setTesting(true);
    try {
      const res = await fetch("/api/settings/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setTestMessage({ type: "error", text: data.error ?? "Erro ao enviar" });
        return;
      }
      setTestMessage({ type: "ok", text: `E-mail de teste enviado para ${testTo}.` });
    } catch (err) {
      setTestMessage({ type: "error", text: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando configuração...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Card>
        <form onSubmit={handleSave}>
          <CardHeader>
            <CardTitle>Conta SMTP</CardTitle>
            <CardDescription>
              Dados do servidor de envio. A senha é armazenada criptografada e nunca é exibida novamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">Servidor SMTP</label>
              <Input
                placeholder="smtp.suaempresa.com.br"
                value={form.host}
                onChange={(e) => update("host", e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Porta</label>
              <Input
                type="number"
                placeholder="587"
                value={form.port}
                onChange={(e) => update("port", Number(e.target.value))}
                required
                disabled={saving}
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.secure}
                  onChange={(e) => update("secure", e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                />
                Conexão segura (SSL/TLS — geralmente porta 465)
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">E-mail de envio (usuário)</label>
              <Input
                type="email"
                placeholder="sistema@suaempresa.com.br"
                value={form.user}
                onChange={(e) => update("user", e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Senha {hasPassword && <span className="font-normal text-muted-foreground">(já configurada)</span>}
              </label>
              <Input
                type="password"
                placeholder={hasPassword ? "Deixe em branco para manter a senha atual" : "Senha da conta de e-mail"}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome do remetente</label>
              <Input
                placeholder="MGSIS Analytics"
                value={form.fromName}
                onChange={(e) => update("fromName", e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">E-mail do remetente</label>
              <Input
                type="email"
                placeholder="naoresponda@suaempresa.com.br"
                value={form.fromEmail}
                onChange={(e) => update("fromEmail", e.target.value)}
                required
                disabled={saving}
              />
            </div>

            {message && (
              <p
                className={
                  "sm:col-span-2 rounded-lg border px-4 py-2.5 text-sm " +
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
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar configuração
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Testar envio</CardTitle>
          <CardDescription>Envia um e-mail de teste usando a configuração salva acima.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            placeholder="destino@teste.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            disabled={testing}
            className="sm:max-w-xs"
          />
          <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !testTo}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar e-mail de teste
          </Button>
        </CardContent>
        {testMessage && (
          <CardContent className="pt-0">
            <p
              className={
                "rounded-lg border px-4 py-2.5 text-sm " +
                (testMessage.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700")
              }
            >
              {testMessage.text}
            </p>
          </CardContent>
        )}
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="h-3 w-3" />
        Essa conta será usada para os e-mails de convite/ativação das empresas cadastradas no futuro.
      </p>
    </div>
  );
}
