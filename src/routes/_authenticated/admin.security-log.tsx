import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ShieldAlert, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/security-log")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isPO = (roles ?? []).some((r) => r.role === "platform_owner");
    if (!isPO) throw redirect({ to: "/dashboard" });
  },
  component: SecurityLogPage,
});

type Row = {
  id: string;
  occurred_at: string;
  event_type: string;
  severity: string;
  user_id: string | null;
  email: string | null;
  path: string | null;
  message: string | null;
  meta: Record<string, unknown> | null;
};

function SecurityLogPage() {
  const [severity, setSeverity] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["security-log", severity, eventType],
    queryFn: async () => {
      let sel = supabase
        .from("security_events")
        .select("id, occurred_at, event_type, severity, user_id, email, path, message, meta")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (severity !== "all") sel = sel.eq("severity", severity);
      if (eventType !== "all") sel = sel.eq("event_type", eventType);
      const { data, error } = await sel;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 30_000,
  });

  const rows = query.data ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.event_type, r.severity, r.email ?? "", r.path ?? "", r.message ?? "", r.user_id ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [rows, q]);

  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.event_type));
    return Array.from(set).sort();
  }, [rows]);

  const sevColor = (s: string) =>
    s === "critical" ? "destructive" : s === "warn" ? "secondary" : "outline";

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Bitácora de seguridad</h1>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={"mr-2 size-4 " + (query.isFetching ? "animate-spin" : "")} />
          Refrescar
        </Button>
      </div>

      <div className="glass mb-4 flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por email, ruta, mensaje…"
            className="pl-9"
          />
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Severidad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda severidad</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Tipo de evento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {eventTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background/80 backdrop-blur">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Cuándo</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Severidad</th>
                <th className="px-3 py-2">Usuario / Email</th>
                <th className="px-3 py-2">Ruta</th>
                <th className="px-3 py-2">Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!query.isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin eventos.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/40 align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                    {new Date(r.occurred_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.event_type}</td>
                  <td className="px-3 py-2">
                    <Badge variant={sevColor(r.severity) as never}>{r.severity}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs">{r.email ?? "—"}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{r.user_id ?? "anon"}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.path ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="max-w-[420px] whitespace-pre-wrap break-words">{r.message ?? "—"}</div>
                    {r.meta && Object.keys(r.meta).length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-muted-foreground">meta</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[10px]">
                          {JSON.stringify(r.meta, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Mostrando los últimos 500 eventos. Auto-refresco cada 30 s.
      </p>
    </main>
  );
}