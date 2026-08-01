import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

const LINKS = [
  { to: "/privacy", label: "Política de Privacidad y Tratamiento de Datos" },
  { to: "/ai-policy", label: "Uso de Inteligencia Artificial" },
  { to: "/terms", label: "Términos y Condiciones" },
] as const;

export const LEGAL_CONTACT_EMAIL = "privacidad@myqanta.lovable.app";
export const LEGAL_UPDATED_AT = "1 de agosto de 2026";

export function LegalLayout({
  title,
  subtitle,
  current,
  children,
}: {
  title: string;
  subtitle?: string;
  current: (typeof LINKS)[number]["to"];
  children: ReactNode;
}) {
  const others = LINKS.filter((l) => l.to !== current);
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[500px] rounded-full bg-chart-2/15 blur-[120px]" />
      </div>

      <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-mono text-sm font-bold">Q</span>
          </div>
          <span className="font-mono text-lg tracking-tight">Qanta</span>
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Volver al inicio
        </Link>
      </nav>

      <article className="mx-auto max-w-3xl px-6 pb-20">
        <header className="mb-8">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          {subtitle ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          ) : null}
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Última actualización: {LEGAL_UPDATED_AT}
          </p>
        </header>

        <div className="glass space-y-8 rounded-3xl p-6 text-sm leading-7 text-muted-foreground sm:p-8">
          {children}
        </div>

        <footer className="mt-8 flex flex-col gap-2 text-xs text-muted-foreground">
          <span>Documentos relacionados</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {others.map((l) => (
              <Link key={l.to} to={l.to} className="underline underline-offset-4 hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </div>
        </footer>
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}