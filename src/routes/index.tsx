import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CSSM — Chat corporativo seguro em tempo real" },
      {
        name: "description",
        content:
          "CSSM é o chat corporativo da sua empresa: conversas diretas e em grupo em tempo real, com controle de acesso por participante e histórico persistente.",
      },
      { property: "og:title", content: "CSSM — Chat corporativo seguro em tempo real" },
      {
        property: "og:description",
        content:
          "Conversas diretas e em grupo em tempo real, com controle de acesso e histórico persistente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  {
    icon: Zap,
    title: "Tempo real",
    text: "Mensagens entregues instantaneamente via canais de realtime.",
  },
  {
    icon: ShieldCheck,
    title: "Acesso controlado",
    text: "Só participantes da conversa leem ou escrevem, garantido no banco.",
  },
  {
    icon: MessageSquare,
    title: "Diretas e grupos",
    text: "Converse com uma pessoa ou monte grupos por time e projeto.",
  },
];

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-lg font-semibold tracking-tight">CSSM</span>
        <Button asChild size="sm">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-16 pt-12">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          MVP · fatia vertical
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          O chat corporativo da sua empresa, seguro e em tempo real.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground">
          Login, conversas e mensagens instantâneas — a base do sistema descrito na documentação
          de arquitetura, já funcionando.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link to="/auth">Começar agora</Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {features.map((f) => (
            <article key={f.title} className="rounded-lg border border-border p-5">
              <f.icon className="size-5 text-primary" />
              <h2 className="mt-3 text-sm font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
