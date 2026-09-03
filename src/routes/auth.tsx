import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logo from "@/assets/cssm-logo-white.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso à Intranet — Casa de Saúde Santa Maria" },
      {
        name: "description",
        content:
          "Entre com suas credenciais corporativas para acessar o chat interno da Casa de Saúde Santa Maria.",
      },
      { property: "og:title", content: "Acesso à Intranet — Casa de Saúde Santa Maria" },
      {
        property: "og:description",
        content: "Acesse o chat corporativo seguro da Casa de Saúde Santa Maria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/conversas", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const normalized = username.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: `${normalized}@nexo.local`,
      password,
    });
    setBusy(false);
    if (error) {
      toast.error("Usuário ou senha inválidos.");
      return;
    }
    try {
      window.localStorage.setItem("nexo:remember", remember ? "1" : "0");
    } catch {
      /* ignore */
    }
    navigate({ to: "/conversas", replace: true });
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-login-bg p-4 text-login-panel-foreground"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 100% 0%, color-mix(in oklch, var(--login-bg-accent) 70%, transparent), transparent 55%), radial-gradient(ellipse at 0% 100%, color-mix(in oklch, var(--login-bg-accent) 45%, transparent), transparent 50%), radial-gradient(color-mix(in oklch, var(--login-panel-foreground) 8%, transparent) 1px, transparent 1px)",
        backgroundSize: "auto, auto, 22px 22px",
      }}
    >
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl md:grid-cols-2">
        <section className="flex flex-col items-center justify-center bg-login-panel px-8 py-10 text-center md:py-16">
          <img
            src={logo}
            alt="Casa de Saúde Santa Maria"
            width={512}
            height={512}
            className="size-24 object-contain drop-shadow"
          />
          <h1 className="mt-6 text-2xl font-bold leading-tight">
            Casa de Saúde
            <br />
            Santa Maria
          </h1>
          <p className="mt-3 text-sm text-login-panel-foreground/75">
            Uma história de amor com a cidade.
          </p>
        </section>

        <section className="bg-card px-8 py-10 text-card-foreground md:py-12">
          <h2 className="text-xl font-bold tracking-tight">Acesso à Intranet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre com suas credenciais corporativas.
          </p>

          <form onSubmit={signIn} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">Nome de usuário</Label>
              <Input
                id="username"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded-full border-border"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Manter conectado
            </label>
            <Button
              type="submit"
              className="w-full bg-login-button text-login-panel-foreground hover:bg-login-button/90"
              disabled={busy}
            >
              Entrar <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Problemas para acessar? Procure o setor de TI.
          </p>
        </section>
      </div>
    </main>
  );
}
