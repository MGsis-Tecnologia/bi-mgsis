"use client";

import * as React from "react";
import { Building2, Copy, Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Empresa {
  id: number;
  cnpjRuc: string;
  nome: string;
  status: string;
  emailMaster: string;
  createdAt: string;
}

interface CreateResult {
  empresa: Empresa;
  integrationToken: string;
  activationLink: string;
  emailSent: boolean;
  emailError?: string;
}

const STATUS_VARIANT: Record<string, "positive" | "warning" | "negative" | "default"> = {
  ativa: "positive",
  pendente: "warning",
  suspensa: "negative",
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <div className="flex gap-2">
        <Input value={value} readOnly className="font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      {copied && <p className="mt-1 text-xs text-positive">Copiado.</p>}
    </div>
  );
}

export function EmpresasManager() {
  const [empresas, setEmpresas] = React.useState<Empresa[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [form, setForm] = React.useState({ nome: "", cnpjRuc: "", emailMaster: "" });
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastCreated, setLastCreated] = React.useState<CreateResult | null>(null);

  const loadEmpresas = React.useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/master/empresas");
      const data = (await res.json()) as { empresas?: Empresa[] };
      setEmpresas(data.empresas ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  React.useEffect(() => {
    loadEmpresas();
  }, [loadEmpresas]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/master/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as (CreateResult & { ok?: boolean; error?: string });
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Erro ao cadastrar empresa");
        return;
      }
      setLastCreated(data);
      setForm({ nome: "", cnpjRuc: "", emailMaster: "" });
      await loadEmpresas();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form onSubmit={handleCreate}>
          <CardHeader>
            <CardTitle>Nova empresa</CardTitle>
            <CardDescription>
              Cria o banco de dados da empresa automaticamente e envia um convite de ativação
              para o e-mail informado.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome da empresa</label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Cliente Exemplo LTDA"
                required
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">CNPJ ou RUC</label>
              <Input
                value={form.cnpjRuc}
                onChange={(e) => setForm((f) => ({ ...f, cnpjRuc: e.target.value }))}
                placeholder="00.000.000/0000-00"
                required
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                E-mail do responsável
              </label>
              <Input
                type="email"
                value={form.emailMaster}
                onChange={(e) => setForm((f) => ({ ...f, emailMaster: e.target.value }))}
                placeholder="admin@clienteexemplo.com"
                required
                disabled={creating}
              />
            </div>

            {error && (
              <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Cadastrar empresa
            </Button>
          </CardFooter>
        </form>
      </Card>

      {lastCreated && (
        <Card>
          <CardHeader>
            <CardTitle>Empresa cadastrada: {lastCreated.empresa.nome}</CardTitle>
            <CardDescription>
              {lastCreated.emailSent
                ? "O convite de ativação foi enviado por e-mail."
                : `Não foi possível enviar o e-mail (${lastCreated.emailError ?? "SMTP não configurado"}) — copie o link abaixo e envie manualmente.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CopyField label="Link de ativação (válido por 7 dias)" value={lastCreated.activationLink} />
            <CopyField label="Token de integração (API/ERP)" value={lastCreated.integrationToken} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Empresas cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : empresas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <Building2 className="h-8 w-8 opacity-40" />
              Nenhuma empresa cadastrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Empresa</th>
                    <th className="py-2 pr-4">CNPJ/RUC</th>
                    <th className="py-2 pr-4">Responsável</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Cadastrada em</th>
                  </tr>
                </thead>
                <tbody>
                  {empresas.map((emp) => (
                    <tr key={emp.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{emp.nome}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{emp.cnpjRuc}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{emp.emailMaster}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={STATUS_VARIANT[emp.status] ?? "default"}>{emp.status}</Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {new Date(emp.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
