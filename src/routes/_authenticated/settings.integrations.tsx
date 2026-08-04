import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Link2, Unlink } from "lucide-react";
import { getNotionAuthUrl, getNotionConnection, disconnectNotion } from "@/lib/notion.functions";
import { usePermissions } from "@/lib/use-permissions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings/integrations")({
  head: () => ({ meta: [
    { title: "Qanta — Integraciones" },
    { name: "description", content: "Conecta tu organización con Notion y otras herramientas externas." },
  ] }),
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();
  const statusFn = useServerFn(getNotionConnection);
  const authUrlFn = useServerFn(getNotionAuthUrl);
  const disconnectFn = useServerFn(disconnectNotion);

  const { data, isLoading } = useQuery({
    queryKey: ["notion-connection"],
    queryFn: () => statusFn(),
  });

  const connect = useMutation({
    mutationFn: () => authUrlFn(),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Notion desconectado");
      qc.invalidateQueries({ queryKey: ["notion-connection"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-sm text-muted-foreground">
          Conecta herramientas externas a tu organización. Solo administradores y propietarios pueden gestionarlas.
        </p>
      </header>

      <div className="glass space-y-4 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Notion</h2>
            <p className="text-sm text-muted-foreground">
              Envía contactos del CRM a una base de datos de Notion. Al autorizar, elige qué páginas compartes con Qanta.
            </p>
            {isLoading ? (
              <p className="mt-3 text-xs text-muted-foreground">Comprobando estado…</p>
            ) : data?.connected ? (
              <p className="mt-3 text-xs text-emerald-500">
                Conectado a <strong>{data.workspace_name ?? "espacio sin nombre"}</strong>
                {data.connected_at ? ` · ${new Date(data.connected_at).toLocaleDateString()}` : ""}
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Sin conexión activa.</p>
            )}
          </div>
          {isAdmin && (
            data?.connected ? (
              <Button variant="outline" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                {disconnect.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Unlink className="mr-2 size-4" />}
                Desconectar
              </Button>
            ) : (
              <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                {connect.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Link2 className="mr-2 size-4" />}
                Conectar con Notion
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
