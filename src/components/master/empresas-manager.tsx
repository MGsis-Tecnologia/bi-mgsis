"use client";

import * as React from "react";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Empresa {
  id: number;
  cnpjRuc: string;
  nome: string;
  /** Nome da database do tenant — mostrado no aviso de exclusão. */
  dbName: string;
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

/**
 * Painel de edição de uma empresa. A exclusão fica atrás de uma confirmação por
 * nome exato porque é irreversível: derruba a database do tenant com todos os
 * dados (vendas, financeiro, usuários) — não é só remover o cadastro.
 */
function EmpresaEditor({
  empresa,
  onSaved,
  onDeleted,
}: {
  empresa: Empresa;
  onSaved: (e: Empresa) => void;
  onDeleted: () => void;
}) {
  const [nome, setNome] = React.useState(empresa.nome);
  const [emailMaster, setEmailMaster] = React.useState(empresa.emailMaster);
  const [saving, setSaving] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  const [confirmandoExclusao, setConfirmandoExclusao] = React.useState(false);
  const [confirmacao, setConfirmacao] = React.useState("");
  const [excluindo, setExcluindo] = React.useState(false);

  const alterado = nome.trim() !== empresa.nome || emailMaster.trim() !== empresa.emailMaster;

  const salvar = async () => {
    setErro(null);
    setOk(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/master/empresas/${empresa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), emailMaster: emailMaster.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; empresa?: Empresa; error?: string };
      if (!res.ok || !data.ok || !data.empresa) {
        setErro(data.error ?? "Erro ao salvar");
        return;
      }
      onSaved(data.empresa);
      setOk(true);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async () => {
    setErro(null);
    setExcluindo(true);
    try {
      const res = await fetch(
        `/api/master/empresas/${empresa.id}?confirm=${encodeURIComponent(confirmacao.trim())}`,
        { method: "DELETE" }
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErro(data.error ?? "Erro ao excluir");
        return;
      }
      onDeleted();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nome da empresa</label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={saving} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            E-mail do responsável
          </label>
          <Input
            type="email"
            value={emailMaster}
            onChange={(e) => setEmailMaster(e.target.value)}
            disabled={saving}
          />
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        O CNPJ/RUC (<span className="font-mono">{empresa.cnpjRuc}</span>) não pode ser alterado — ele
        define o nome da database da empresa e é usado como credencial de login.
      </p>

      {erro && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {erro}
        </p>
      )}
      {ok && <p className="mt-3 text-sm text-positive">Alterações salvas.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={salvar} disabled={saving || !alterado}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar alterações
        </Button>
        {!confirmandoExclusao && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirmandoExclusao(true)}
            className="text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Excluir empresa
          </Button>
        )}
      </div>

      {confirmandoExclusao && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-800">
                Isto apaga a empresa e todos os dados dela, sem volta.
              </p>
              <p className="mt-1 text-xs text-red-700">
                A database <span className="font-mono">{empresa.dbName}</span> será derrubada —
                vendas, financeiro, estoque, usuários e configurações da empresa são perdidos
                permanentemente. Não há backup automático.
              </p>
              <p className="mt-3 text-xs font-medium text-red-800">
                Para confirmar, digite o nome exato da empresa:{" "}
                <span className="font-mono">{empresa.nome}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder={empresa.nome}
                  disabled={excluindo}
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={excluir}
                  disabled={excluindo || confirmacao.trim() !== empresa.nome}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {excluindo && <Loader2 className="h-4 w-4 animate-spin" />}
                  Excluir definitivamente
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={excluindo}
                  onClick={() => {
                    setConfirmandoExclusao(false);
                    setConfirmacao("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);

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

  // Suspender é o corte de acesso não destrutivo: nenhum usuário da empresa
  // consegue mais entrar nem seguir usando a sessão já aberta (o status é
  // checado a cada requisição em getTenantPrisma).
  const toggleStatus = async (emp: Empresa) => {
    setListError(null);
    setBusyId(emp.id);
    try {
      const novo = emp.status === "ativa" ? "suspensa" : "ativa";
      const res = await fetch(`/api/master/empresas/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novo }),
      });
      const data = (await res.json()) as { ok?: boolean; empresa?: Empresa; error?: string };
      if (!res.ok || !data.ok || !data.empresa) {
        setListError(data.error ?? "Erro ao alterar o status");
        return;
      }
      setEmpresas((prev) => prev.map((e) => (e.id === emp.id ? data.empresa! : e)));
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

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
          <CardDescription>
            Clique numa empresa para editar ou excluir. Suspender corta o acesso de todos os
            usuários dela imediatamente, sem apagar nada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listError && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {listError}
            </p>
          )}
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
            <div className="flex flex-col">
              {empresas.map((emp) => {
                const expanded = expandedId === emp.id;
                const ativa = emp.status === "ativa";
                return (
                  <div key={emp.id} className="border-b border-border/50 last:border-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedId(expanded ? null : emp.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setExpandedId(expanded ? null : emp.id);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-4 py-3 rounded-md px-2 -mx-2",
                        "cursor-pointer hover:bg-muted/30"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{emp.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          <span className="font-mono">{emp.cnpjRuc}</span> · {emp.emailMaster}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {new Date(emp.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                        <Badge variant={STATUS_VARIANT[emp.status] ?? "default"}>{emp.status}</Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyId === emp.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleStatus(emp);
                          }}
                        >
                          {busyId === emp.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : ativa ? (
                            "Suspender"
                          ) : (
                            "Ativar"
                          )}
                        </Button>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                    {expanded && (
                      <EmpresaEditor
                        empresa={emp}
                        onSaved={(atualizada) =>
                          setEmpresas((prev) =>
                            prev.map((e) => (e.id === atualizada.id ? atualizada : e))
                          )
                        }
                        onDeleted={() => {
                          setExpandedId(null);
                          setEmpresas((prev) => prev.filter((e) => e.id !== emp.id));
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
