import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Nexo Chat Corporativo" },
      {
        name: "description",
        content:
          "Acesse o Nexo, o chat corporativo seguro da sua empresa: conversas em tempo real, grupos e histórico auditável.",
      },
      { property: "og:title", content: "Entrar — Nexo Chat Corporativo" },
      {
        property: "og:description",
        content: "Acesse o chat corporativo seguro da sua equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/conversas", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/conversas", replace: true });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <span className="text-lg font-semibold tracking-tight">Nexo</span>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Comunicação corporativa em tempo real, com controle de acesso de ponta a ponta.
          </h1>
          <p className="mt-4 max-w-md text-sm opacity-80">
            Conversas diretas e em grupo, histórico persistente e permissões por participante.
          </p>
        </div>
        <span className="text-xs opacity-70">MVP · fatia vertical</span>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Acessar o Nexo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use as credenciais fornecidas pela administração da sua empresa.
          </p>

          <div>
            <div>
              <form onSubmit={signIn} className="space-y-4 pt-6">

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Entrar
                </Button>
              </form>
            </div>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Contas são criadas exclusivamente pela administração no painel interno.
          </p>

        </div>
      </section>
    </main>
  );
}
