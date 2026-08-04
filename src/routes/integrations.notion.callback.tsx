import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { completeNotionOAuth } from "@/lib/notion.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/integrations/notion/callback")({
  head: () => ({ meta: [
    { title: "Qanta — Conectando con Notion" },
    { name: "description", content: "Finalizando la conexión de tu organización con Notion." },
    { property: "og:title", content: "Qanta — Conectando con Notion" },
    { property: "og:description", content: "Finalizando la conexión de tu organización con Notion." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md p-8 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: NotionCallback,
});

function NotionCallback() {
  const { code, state, error } = Route.useSearch();
  const complete = useServerFn(completeNotionOAuth);
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Finalizando la conexión con Notion…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (error || !code || !state) {
      setStatus("error");
      setMessage(error ? `Notion devolvió un error: ${error}` : "Faltan parámetros en la respuesta de Notion.");
      return;
    }
    void complete({ data: { code, state } })
      .then((r) => {
        setStatus("ok");
        setMessage(`Conectado a ${r.workspace_name ?? "tu espacio de Notion"}.`);
        setTimeout(() => navigate({ to: "/settings/integrations" as never, search: { notion: "connected" } as never }), 1200);
      })
      .catch((e: Error) => {
        setStatus("error");
        setMessage(e.message);
      });
  }, [code, state, error, complete, navigate]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      {status === "working" && <Loader2 className="size-8 animate-spin text-muted-foreground" />}
      {status === "ok" && <CheckCircle2 className="size-8 text-emerald-500" />}
      {status === "error" && <AlertCircle className="size-8 text-destructive" />}
      <h1 className="text-xl font-semibold">Conexión con Notion</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild variant="secondary">
        <Link to={"/settings/integrations" as never}>Ir a Integraciones</Link>
      </Button>
    </main>
  );
}
