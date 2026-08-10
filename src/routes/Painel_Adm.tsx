import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogOut, Trash2 } from "lucide-react";
import {
  adminMe,
  adminLogin,
  adminLogout,
  adminUpdateCredentials,
  adminListUsers,
  adminCreateUser,
  adminDeleteUser,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/Painel_Adm")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Painel Administrativo — Nexo" },
      {
        name: "description",
        content:
          "Área restrita de administração do Nexo: criação de usuários corporativos e gestão das credenciais do painel.",
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
  created_at: string;
};

function PainelAdm() {
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(false);
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    adminMe()
      .then((r) => {
        setAuth(r.authenticated);
        setAdminName(r.username);
      })
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
        onSuccess={(username) => {
          setAuth(true);
          setAdminName(username);
        }}
      />
    );
  }

  return (
    <Dashboard
      adminName={adminName}
      onAdminName={setAdminName}
      onLogout={() => {
        setAuth(false);
        setAdminName("");
      }}
    />
  );
}

function LoginScreen({ onSuccess }: { onSuccess: (username: string) => void }) {
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
    onSuccess(res.username);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Painel Administrativo</CardTitle>
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

function Dashboard({
  adminName,
  onAdminName,
  onLogout,
}: {
  adminName: string;
  onAdminName: (v: string) => void;
  onLogout: () => void;
}) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const [credUser, setCredUser] = useState(adminName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingCred, setSavingCred] = useState(false);

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

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await adminCreateUser({ data: { username: newUsername, password, fullName } });
    setCreating(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    setNewUsername("");
    setFullName("");
    setPassword("");
    void refresh();
  }

  async function removeUser(id: string) {
    const res = await adminDeleteUser({ data: { userId: id } });
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    void refresh();
  }

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSavingCred(true);
    const res = await adminUpdateCredentials({
      data: newPassword
        ? { currentPassword, username: credUser, newPassword }
        : { currentPassword, username: credUser },
    });

    setSavingCred(false);
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
    <main className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Painel Administrativo</h1>
            <p className="text-xs text-muted-foreground">Conectado como {adminName}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await adminLogout();
              onLogout();
            }}
          >
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criar usuário</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nu-name">Nome completo</Label>
                <Input
                  id="nu-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nu-email">E-mail corporativo</Label>
                <Input
                  id="nu-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nu-pass">Senha inicial</Label>
                <Input
                  id="nu-pass"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={creating} className="w-full">
                Criar usuário
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credenciais do painel</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveCredentials} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cred-user">Login</Label>
                <Input
                  id="cred-user"
                  required
                  value={credUser}
                  onChange={(e) => setCredUser(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cred-current">Senha atual</Label>
                <Input
                  id="cred-current"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cred-new">Nova senha (opcional)</Label>
                <Input
                  id="cred-new"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary" disabled={savingCred} className="w-full">
                Salvar alterações
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Usuários ({users.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {users.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
            )}
            {users.map((u, i) => (
              <div key={u.id}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeUser(u.id)}
                    aria-label={`Remover ${u.full_name}`}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
