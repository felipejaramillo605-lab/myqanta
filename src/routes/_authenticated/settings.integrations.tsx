import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Link2, Unlink, RefreshCw } from "lucide-react";
import {
  createNotionOAuthState,
  getNotionConnection,
  disconnectNotion,
  listNotionDatabases,
  setNotionDatabase,
  syncContactsToNotion,
} from "@/lib/notion.functions";
import { usePermissions } from "@/lib/use-permissions";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings/integrations")({
  head: () => ({ meta: [
    { title: "Qanta — Integraciones" },
    { name: "description", content: "Conecta tu organización con Notion y otras herramientas externas." },
  ] }),
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>
  ),
  validateSearch: (search: Record<string, unknown>) => ({
    notion: typeof search.notion === "string" ? search.notion : undefined,
    message: typeof search.message === "string" ? search.message : undefined,
  }),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const qc = useQueryClient();
  const { notion, message } = Route.useSearch();
  const { isAdmin } = usePermissions();
  const statusFn = useServerFn(getNotionConnection);
  const stateFn = useServerFn(createNotionOAuthState);
  const disconnectFn = useServerFn(disconnectNotion);
  const listDbFn = useServerFn(listNotionDatabases);
  const setDbFn = useServerFn(setNotionDatabase);
  const syncFn = useServerFn(syncContactsToNotion);

  const { data, isLoading } = useQuery({
    queryKey: ["notion-connection"],
    queryFn: () => statusFn(),
  });

  useEffect(() => {
    if (notion === "connected") toast.success("Notion conectado correctamente");
    if (notion === "error") toast.error(message || "No se pudo conectar con Notion");
  }, [notion, message]);

  const connect = useMutation({
    mutationFn: () => stateFn(),
    onSuccess: (r: { state: string }) => {
      window.location.href = `/api/integrations/notion/authorize?state=${encodeURIComponent(r.state)}`;
    },
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

  const { data: databases, isLoading: dbLoading, error: dbError } = useQuery({
    queryKey: ["notion-databases"],
    queryFn: () => listDbFn(),
    enabled: !!data?.connected && isAdmin,
  });

  const [dbId, setDbId] = useState("");
  useEffect(() => { if (data?.database_id) setDbId(data.database_id); }, [data?.database_id]);

  const saveDb = useMutation({
    mutationFn: (id: string) => setDbFn({ data: { database_id: id } }),
    onSuccess: () => {
      toast.success("Base de datos guardada");
      qc.invalidateQueries({ queryKey: ["notion-connection"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r: { created: number; updated: number; failed: number }) => {
      toast.success(`Sincronización lista: ${r.created} creados, ${r.updated} actualizados, ${r.failed} con error`);
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

        {data?.connected && isAdmin && (
          <div className="space-y-4 border-t border-border/40 pt-4">
            <div>
              <label className="text-xs text-muted-foreground">Base de datos a sincronizar</label>
              {dbLoading && <p className="text-sm text-muted-foreground">Cargando bases de datos…</p>}
              {dbError && <p className="text-sm text-destructive">{(dbError as Error).message}</p>}
              {databases && databases.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay bases de datos compartidas con Qanta. Compártelas desde Notion y recarga.
                </p>
              )}
              {databases && databases.length > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <Select
                    value={dbId}
                    onValueChange={(v) => { setDbId(v); saveDb.mutate(v); }}
                  >
                    <SelectTrigger className="max-w-sm">
                      <SelectValue placeholder="Elige una base de datos" />
                    </SelectTrigger>
                    <SelectContent>
                      {databases.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {saveDb.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => sync.mutate()} disabled={!dbId || sync.isPending}>
                {sync.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                Sincronizar ahora
              </Button>
              <span className="text-xs text-muted-foreground">
                Envía los contactos del CRM (con la etapa de su negocio más reciente) a Notion.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
