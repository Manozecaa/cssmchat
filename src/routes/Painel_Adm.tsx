import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  Download,
  Home,
  Loader2,
  LogOut,
  Menu,
  MessagesSquare,
  Search,
  Shield,
  SquarePen,
  UserCog,
  Users,
} from "lucide-react";
import {
  adminMe,
  adminLogin,
  adminLogout,
  adminUpdateCredentials,
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminListAdmins,
  adminCreateAdmin,
  adminUpdateAdmin,
  adminDeleteAdmin,
  adminListConversations,
  adminExportConversation,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/Painel_Adm")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel Administrativo — Nexo" },
      {
        name: "description",
        content:
          "Área restrita de administração do Nexo: cadastro de usuários corporativos e gestão das credenciais do painel.",
      },
      { property: "og:title", content: "Painel Administrativo — Nexo" },
      {
        property: "og:description",
        content: "Área restrita de administração do chat corporativo Nexo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PainelAdm,
});

type AppUser = {
  id: string;
  email: string | null;
  username: string;
  full_name: string;
  description: string | null;
  sector: string | null;
  is_active: boolean;
  created_at: string;
};

type AdminAccount = {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

type AdminConversation = {
  id: string;
  title: string | null;
  is_group: boolean;
  updated_at: string;
  participants: string[];
};

type Role = "primary" | "secondary";

type View = "home" | "usuarios" | "cadastro" | "credenciais" | "admins" | "conversas";

function PainelAdm() {
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [role, setRole] = useState<Role>("secondary");

  useEffect(() => {
    adminMe()
      .then((r) => {
        setAuth(r.authenticated);
        setAdminName(r.username);
        setRole(r.role === "primary" ? "primary" : "secondary");
      })
      .catch(() => setAuth(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!auth) {
    return (
      <LoginScreen
        onSuccess={(username, r) => {
          setAuth(true);
          setAdminName(username);
          setRole(r);
        }}
      />
    );
  }

  return (
    <Shell
      adminName={adminName}
      role={role}
      onAdminName={setAdminName}
      onLogout={() => {
        setAuth(false);
        setAdminName("");
      }}
    />
  );
}

function LoginScreen({ onSuccess }: { onSuccess: (username: string, role: Role) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await adminLogin({ data: { username, password } });
    setBusy(false);
    if (!res.ok) {
      toast.error("Usuário ou senha inválidos.");
      return;
    }
    onSuccess(res.username, res.role === "primary" ? "primary" : "secondary");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-admin-sidebar px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Painel administrativo</CardTitle>
          <p className="text-sm text-muted-foreground">Acesso restrito à administração.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adm-user">Login</Label>
              <Input
                id="adm-user"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adm-pass">Senha</Label>
              <Input
                id="adm-pass"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function Shell({
  adminName,
  role,
  onAdminName,
  onLogout,
}: {
  adminName: string;
  role: Role;
  onAdminName: (v: string) => void;
  onLogout: () => void;
}) {
  const [view, setView] = useState<View>("usuarios");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [editing, setEditing] = useState<AppUser | null>(null);

  async function refresh() {
    try {
      setUsers((await adminListUsers()) as AppUser[]);
    } catch {
      toast.error("Não foi possível carregar os usuários.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const titles: Record<View, string> = {
    home: "Home",
    usuarios: "Usuários",
    cadastro: editing ? "Editar usuário" : "Cadastro de usuários",
    credenciais: "Credenciais do painel",
    admins: "Administradores",
    conversas: "Download de conversas",
  };

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside
        className={cn(
          "hidden shrink-0 flex-col bg-admin-sidebar text-admin-sidebar-foreground md:flex",
          sidebarOpen ? "w-60" : "w-0 overflow-hidden",
        )}
      >
        <div className="px-5 py-4 text-lg font-medium">Painel administrativo</div>
        <div className="px-5 pb-5 text-center">
          <p className="text-xs text-admin-sidebar-muted">Bem-vindo</p>
          <p className="text-sm font-semibold">{adminName}</p>
          <p className="text-xs text-admin-sidebar-muted">
            {role === "primary" ? "Administrador principal" : "Administrador secundário"}
          </p>
        </div>
        <p className="px-5 pb-2 text-[11px] font-semibold tracking-wider text-admin-sidebar-muted">
          GENERAL
        </p>
        <nav className="flex flex-col text-sm">
          <SideItem icon={Home} label="Home" active={view === "home"} onClick={() => setView("home")} />
          <div className="flex items-center gap-3 px-5 py-3 text-admin-sidebar-foreground">
            <SquarePen className="size-4" />
            <span className="flex-1">Cadastros</span>
            <ChevronDown className="size-4 text-admin-sidebar-muted" />
          </div>
          <SubItem
            label="Usuários"
            active={view === "usuarios"}
            onClick={() => {
              setEditing(null);
              setView("usuarios");
            }}
          />
          <SubItem
            label="Novo usuário"
            active={view === "cadastro"}
            onClick={() => {
              setEditing(null);
              setView("cadastro");
            }}
          />
          <SideItem
            icon={MessagesSquare}
            label="Conversas"
            active={view === "conversas"}
            onClick={() => setView("conversas")}
          />
          {role === "primary" && (
            <SideItem
              icon={Shield}
              label="Administradores"
              active={view === "admins"}
              onClick={() => setView("admins")}
            />
          )}
          <SideItem
            icon={UserCog}
            label="Credenciais"
            active={view === "credenciais"}
            onClick={() => setView("credenciais")}
          />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-admin-topbar px-4 py-3">
          <button
            aria-label="Alternar menu"
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded p-1 text-admin-heading hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
          <button
            onClick={async () => {
              await adminLogout();
              onLogout();
            }}
            className="flex items-center gap-2 text-sm text-admin-heading hover:underline"
          >
            {adminName} <LogOut className="size-4" />
          </button>
        </header>

        <main className="flex-1 px-6 py-6">
          <h1 className="mb-5 text-2xl font-light text-admin-heading">{titles[view]}</h1>

          {view === "home" && <HomeCards count={users.length} onGo={() => setView("usuarios")} />}

          {view === "cadastro" && (
            <UserForm
              key={editing?.id ?? "new"}
              editing={editing}
              onDone={() => {
                setEditing(null);
                setView("usuarios");
                void refresh();
              }}
            />
          )}

          {view === "usuarios" && (
            <UsersTable
              users={users}
              onNew={() => {
                setEditing(null);
                setView("cadastro");
              }}
              onEdit={(u) => {
                setEditing(u);
                setView("cadastro");
              }}
              onDelete={async (u) => {
                const res = await adminDeleteUser({ data: { userId: u.id } });
                if (!res.ok) {
                  toast.error(res.message);
                  return;
                }
                toast.success(res.message);
                void refresh();
              }}
            />
          )}

          {view === "conversas" && <ConversationsPanel />}

          {view === "admins" && role === "primary" && <AdminsPanel />}

          {view === "credenciais" && (
            <CredentialsForm adminName={adminName} onAdminName={onAdminName} />
          )}
        </main>
      </div>
    </div>
  );
}

function SideItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-admin-sidebar-active",
        active && "border-l-4 border-admin-accent bg-admin-sidebar-active pl-4",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function SubItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 py-2 pl-10 pr-5 text-left text-admin-sidebar-muted transition-colors hover:bg-admin-sidebar-active hover:text-admin-sidebar-foreground",
        active && "bg-admin-sidebar-active text-admin-sidebar-foreground",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </button>
  );
}

function HomeCards({ count, onGo }: { count: number; onGo: () => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-muted-foreground">
            Usuários cadastrados
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-3xl font-semibold">{count}</span>
          <Users className="size-8 text-muted-foreground/40" />
        </CardContent>
      </Card>
      <Card className="flex items-center justify-center p-6">
        <Button onClick={onGo} variant="secondary">
          Gerenciar usuários
        </Button>
      </Card>
    </div>
  );
}

function UserForm({ editing, onDone }: { editing: AppUser | null; onDone: () => void }) {
  const [fullName, setFullName] = useState(editing?.full_name ?? "");
  const [username, setUsername] = useState(editing?.username ?? "");
  const [sector, setSector] = useState(editing?.sector ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  function clear() {
    setFullName("");
    setUsername("");
    setSector("");
    setDescription("");
    setPassword("");
    setConfirm("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setBusy(true);
    const res = editing
      ? await adminUpdateUser({
          data: {
            userId: editing.id,
            username,
            fullName,
            sector,
            description,
            isActive,
            ...(password ? { password } : {}),
          },
        })
      : await adminCreateUser({ data: { username, password, fullName, sector, description } });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    clear();
    onDone();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4">
          <Field id="uf-name" label="Nome completo" required>
            <Input
              id="uf-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>
          <Field id="uf-user" label="Nome de usuário (login)" required>
            <Input
              id="uf-user"
              required
              pattern="[A-Za-z0-9._-]{3,32}"
              title="3 a 32 caracteres: letras, números, ponto, hífen ou underline"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field id="uf-sector" label="Setor">
            <Input
              id="uf-sector"
              maxLength={80}
              placeholder="Ex.: Financeiro"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />
          </Field>
          <Field id="uf-desc" label="Descrição">
            <Textarea
              id="uf-desc"
              rows={3}
              maxLength={500}
              placeholder="Cargo, responsabilidades, observações…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field id="uf-pass" label={editing ? "Nova senha (opcional)" : "Senha"} required={!editing}>
            <Input
              id="uf-pass"
              type="password"
              required={!editing}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field id="uf-confirm" label="Confirmar senha" required={!editing}>
            <Input
              id="uf-confirm"
              type="password"
              required={!editing}
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {editing && (
            <Field id="uf-active" label="Usuário ativo">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  id="uf-active"
                  type="checkbox"
                  className="size-4"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Usuários inativos não aparecem no chat e não podem ser contatados.
              </label>
            </Field>
          )}

          <div className="flex justify-center gap-3 border-t border-border pt-5">
            <Button type="button" variant="outline" onClick={clear}>
              Limpar
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="bg-admin-success text-white hover:bg-admin-success/90"
            >
              {editing ? "Salvar" : "Enviar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[220px_1fr] sm:gap-4">
      <Label htmlFor={id} className="text-muted-foreground sm:justify-end">
        {label} {required && <span className="text-admin-danger">*</span>}
      </Label>
      {children}
    </div>
  );
}

function UsersTable({
  users,
  onNew,
  onEdit,
  onDelete,
}: {
  users: AppUser[];
  onNew: () => void;
  onEdit: (u: AppUser) => void;
  onDelete: (u: AppUser) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.sector ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <div className="flex w-full max-w-xs items-center gap-0">
          <Input
            placeholder="Search for..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-r-none"
          />
          <Button variant="secondary" className="rounded-l-none" aria-label="Buscar">
            <Search className="size-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border">
          <CardTitle className="text-base font-normal text-admin-heading">
            Usuários cadastrados
          </CardTitle>
          <Button size="sm" variant="secondary" onClick={onNew}>
            Cadastrar novo usuário
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left align-top font-semibold">
                <th className="pb-3 pr-4">Nome</th>
                <th className="pb-3 pr-4">Usuário</th>
                <th className="pb-3 pr-4">Setor</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Criado em</th>
                <th className="pb-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-muted-foreground">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="py-4 pr-4">{u.full_name}</td>
                  <td className="py-4 pr-4 text-muted-foreground">@{u.username}</td>
                  <td className="py-4 pr-4 text-muted-foreground">{u.sector || "—"}</td>
                  <td className="py-4 pr-4">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        u.is_active
                          ? "bg-admin-success/15 text-admin-success"
                          : "bg-admin-danger/15 text-admin-danger",
                      )}
                    >
                      {u.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="py-4 pr-4 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-4">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        size="sm"
                        onClick={() => onEdit(u)}
                        className="bg-admin-success text-white hover:bg-admin-success/90"
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Excluir definitivamente o usuário ${u.full_name}? Esta ação não pode ser desfeita.`,
                            )
                          )
                            onDelete(u);
                        }}
                        className="bg-admin-danger text-white hover:bg-admin-danger/90"
                      >
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

function CredentialsForm({
  adminName,
  onAdminName,
}: {
  adminName: string;
  onAdminName: (v: string) => void;
}) {
  const [credUser, setCredUser] = useState(adminName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await adminUpdateCredentials({
      data: newPassword
        ? { currentPassword, username: credUser, newPassword }
        : { currentPassword, username: credUser },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    onAdminName(credUser);
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={save} className="mx-auto max-w-3xl space-y-4">
          <Field id="cred-user" label="Login" required>
            <Input
              id="cred-user"
              required
              value={credUser}
              onChange={(e) => setCredUser(e.target.value)}
            />
          </Field>
          <Field id="cred-current" label="Senha atual" required>
            <Input
              id="cred-current"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <Field id="cred-new" label="Nova senha (opcional)">
            <Input
              id="cred-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <div className="flex justify-center border-t border-border pt-5">
            <Button
              type="submit"
              disabled={busy}
              className="bg-admin-success text-white hover:bg-admin-success/90"
            >
              Salvar alterações
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
