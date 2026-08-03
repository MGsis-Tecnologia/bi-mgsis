"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, UserCog } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MENU_CATALOG } from "@/lib/menu-catalog";
import { cn } from "@/lib/utils";

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  menuKeys: string[];
}

interface InviteResult {
  activationLink: string;
  emailSent: boolean;
  emailError?: string;
}

function PermissionMatrix({ user, onSaved }: { user: UserRow; onSaved: (menuKeys: string[]) => void }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set(user.menuKeys));
  const [saving, setSaving] = React.useState(false);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const menuKeys = [...selected];
      const res = await fetch(`/api/users/${user.id}/menu-permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuKeys }),
      });
      if (res.ok) onSaved(menuKeys);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border/50 bg-muted/20 px-4 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MENU_CATALOG.map((group) => (
          <div key={group.section}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.section}
            </p>
            <div className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(item.key)}
                    onChange={() => toggle(item.key)}
                    className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" className="mt-4" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Salvar permissões
      </Button>
    </div>
  );
}

export function UsersManager() {
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  const [form, setForm] = React.useState({ name: "", email: "", role: "user" });
  const [inviting, setInviting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteResult, setInviteResult] = React.useState<InviteResult | null>(null);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = (await res.json()) as { users?: UserRow[] };
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInviting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as InviteResult & { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Erro ao convidar usuário");
        return;
      }
      setInviteResult(data);
      setForm({ name: "", email: "", role: "user" });
      await loadUsers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const toggleActive = async (user: UserRow) => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    if (res.ok) await loadUsers();
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form onSubmit={handleInvite}>
          <CardHeader>
            <CardTitle>Convidar usuário</CardTitle>
            <CardDescription>Envia um link de ativação por e-mail para o novo usuário definir a senha.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nome</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome completo"
                required
                disabled={inviting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">E-mail</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="colega@empresa.com"
                required
                disabled={inviting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Papel</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                disabled={inviting}
                className="flex h-9 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <option value="user">Usuário (menus restritos)</option>
                <option value="admin">Admin (acesso total)</option>
              </select>
            </div>
            {error && (
              <p className="sm:col-span-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={inviting}>
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Convidar
            </Button>
          </CardFooter>
        </form>
      </Card>

      {inviteResult && (
        <Card>
          <CardHeader>
            <CardTitle>Convite enviado</CardTitle>
            <CardDescription>
              {inviteResult.emailSent
                ? "O e-mail de convite foi enviado."
                : `Não foi possível enviar o e-mail (${inviteResult.emailError ?? "SMTP não configurado"}) — copie o link e envie manualmente.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input value={inviteResult.activationLink} readOnly className="font-mono text-xs" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Usuários da empresa</CardTitle>
          <CardDescription>Clique num usuário para editar os menus liberados.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <UserCog className="h-8 w-8 opacity-40" />
              Nenhum usuário ainda.
            </div>
          ) : (
            <div className="flex flex-col">
              {users.map((user) => {
                const expanded = expandedId === user.id;
                return (
                  <div key={user.id} className="border-b border-border/50 last:border-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => user.role !== "admin" && setExpandedId(expanded ? null : user.id)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && user.role !== "admin") {
                          setExpandedId(expanded ? null : user.id);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-4 py-3 rounded-md px-2 -mx-2",
                        user.role !== "admin" && "cursor-pointer hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={user.role === "admin" ? "accent" : "default"}>{user.role}</Badge>
                        <Badge variant={user.isActive ? "positive" : "negative"}>
                          {user.isActive ? "ativo" : "inativo"}
                        </Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleActive(user);
                          }}
                        >
                          {user.isActive ? "Inativar" : "Ativar"}
                        </Button>
                        {user.role !== "admin" &&
                          (expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                      </div>
                    </div>
                    {expanded && user.role !== "admin" && (
                      <PermissionMatrix
                        user={user}
                        onSaved={(menuKeys) =>
                          setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, menuKeys } : u)))
                        }
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
