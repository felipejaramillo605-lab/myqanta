import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getTrafficSummary, getTrafficSeries, getTopUsers, getTopIps, getSuspicious,
  addWatch, removeWatch,
} from "@/lib/platform-security.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Activity, AlertTriangle, Eye, EyeOff, RefreshCw, ShieldAlert, Users, Globe, Zap } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/security")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    if (!(roles ?? []).some((r) => r.role === "platform_owner")) throw redirect({ to: "/dashboard" });
  },
  component: SecurityPage,
});

function SecurityPage() {
  const qc = useQueryClient();
  const [hours, setHours] = useState(24);

  const summaryQ = useQuery({ queryKey: ["sec-summary", hours], queryFn: () => getTrafficSummary({ data: { hours } }), refetchInterval: 30_000 });
  const seriesQ = useQuery({ queryKey: ["sec-series", hours], queryFn: () => getTrafficSeries({ data: { hours } }), refetchInterval: 30_000 });
  const usersQ = useQuery({ queryKey: ["sec-users", hours], queryFn: () => getTopUsers({ data: { hours } }), refetchInterval: 60_000 });
  const ipsQ = useQuery({ queryKey: ["sec-ips", hours], queryFn: () => getTopIps({ data: { hours } }), refetchInterval: 60_000 });
  const suspQ = useQuery({ queryKey: ["sec-susp", hours], queryFn: () => getSuspicious({ data: { hours } }), refetchInterval: 30_000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sec-summary"] });
    qc.invalidateQueries({ queryKey: ["sec-series"] });
    qc.invalidateQueries({ queryKey: ["sec-users"] });
    qc.invalidateQueries({ queryKey: ["sec-ips"] });
    qc.invalidateQueries({ queryKey: ["sec-susp"] });
  };

  const watchMut = useMutation({
    mutationFn: (v: { ip_hash: string; reason?: string }) => addWatch({ data: v }),
    onSuccess: () => { toast.success("IP marcada"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const unwatchMut = useMutation({
    mutationFn: (v: { ip_hash: string }) => removeWatch({ data: v }),
    onSuccess: () => { toast.success("IP removida"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = (summaryQ.data ?? {}) as Record<string, number>;
  const series = (seriesQ.data ?? []).map((r) => ({
    ...r,
    label: new Date(r.bucket).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <ShieldAlert className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Seguridad y tráfico</h1>
          <p className="text-sm text-muted-foreground">
            Monitoreo en vivo de peticiones, usuarios activos e intentos sospechosos.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última hora</SelectItem>
              <SelectItem value="6">Últimas 6h</SelectItem>
              <SelectItem value="24">Últimas 24h</SelectItem>
              <SelectItem value="168">Últimos 7 días</SelectItem>
              <SelectItem value="720">Últimos 30 días</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={invalidate}>
            <RefreshCw className="mr-2 size-4" /> Refrescar
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Activity} label="Peticiones" value={s.requests ?? 0} />
        <Kpi icon={Users} label="Usuarios activos" value={s.unique_users ?? 0} />
        <Kpi icon={Globe} label="IPs únicas" value={s.unique_ips ?? 0} />
        <Kpi icon={Zap} label="Latencia media" value={`${s.avg_ms ?? 0} ms`} />
        <Kpi icon={AlertTriangle} label="Errores 4xx" value={s.errors_4xx ?? 0} tone={(s.errors_4xx ?? 0) > 20 ? "warn" : undefined} />
        <Kpi icon={AlertTriangle} label="Errores 5xx" value={s.errors_5xx ?? 0} tone={(s.errors_5xx ?? 0) > 0 ? "danger" : undefined} />
        <Kpi icon={ShieldAlert} label="Logins fallidos" value={s.failed_logins ?? 0} tone={(s.failed_logins ?? 0) > 5 ? "warn" : undefined} />
        <Kpi icon={EyeOff} label="Bloqueados" value={s.blocked_users ?? 0} />
      </div>

      <section className="glass rounded-xl border border-border/50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tráfico</h2>
          <span className="text-xs text-muted-foreground">Peticiones y errores por hora</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Line type="monotone" dataKey="requests" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="errors" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {(suspQ.data?.length ?? 0) > 0 && (
        <section className="glass rounded-xl border border-destructive/40 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" /> Sospechosos ({suspQ.data?.length})
          </h2>
          <div className="grid gap-2">
            {suspQ.data?.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/40 p-2 text-sm">
                <div>
                  <Badge variant="destructive" className="mr-2">{s.kind}</Badge>
                  <span className="font-mono text-xs">{s.subject}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{JSON.stringify(s.detail)}</span>
                </div>
                <Badge variant="outline">score {s.score}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Top usuarios</TabsTrigger>
          <TabsTrigger value="ips">Top IPs</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-3">
          <div className="glass overflow-hidden rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Usuario</th>
                  <th className="p-3 text-right">Peticiones</th>
                  <th className="p-3 text-right">Errores</th>
                  <th className="p-3 text-right">Latencia</th>
                  <th className="p-3 text-right">Último acceso</th>
                </tr>
              </thead>
              <tbody>
                {(usersQ.data ?? []).map((u) => (
                  <tr key={u.user_id} className="border-t border-border/40">
                    <td className="p-3">
                      <div className="text-xs">{u.email ?? "—"}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{u.user_id}</div>
                    </td>
                    <td className="p-3 text-right font-mono">{u.requests}</td>
                    <td className="p-3 text-right font-mono">{u.errors > 0 ? <span className="text-destructive">{u.errors}</span> : u.errors}</td>
                    <td className="p-3 text-right font-mono">{u.avg_ms}ms</td>
                    <td className="p-3 text-right text-xs text-muted-foreground">{new Date(u.last_seen).toLocaleString()}</td>
                  </tr>
                ))}
                {(usersQ.data ?? []).length === 0 && !usersQ.isLoading && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin actividad en el rango.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="ips" className="mt-3">
          <div className="glass overflow-hidden rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">IP (hash)</th>
                  <th className="p-3 text-right">Peticiones</th>
                  <th className="p-3 text-right">Errores</th>
                  <th className="p-3 text-right">Usuarios</th>
                  <th className="p-3 text-right">Último</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {(ipsQ.data ?? []).map((ip) => (
                  <tr key={ip.ip_hash} className="border-t border-border/40">
                    <td className="p-3 font-mono text-xs">
                      {ip.ip_hash}
                      {ip.watched && <Badge variant="destructive" className="ml-2">Observada</Badge>}
                    </td>
                    <td className="p-3 text-right font-mono">{ip.requests}</td>
                    <td className="p-3 text-right font-mono">{ip.errors > 0 ? <span className="text-destructive">{ip.errors}</span> : ip.errors}</td>
                    <td className="p-3 text-right font-mono">{ip.unique_users}</td>
                    <td className="p-3 text-right text-xs text-muted-foreground">{new Date(ip.last_seen).toLocaleString()}</td>
                    <td className="p-3 text-right">
                      {ip.watched ? (
                        <Button size="sm" variant="ghost" onClick={() => unwatchMut.mutate({ ip_hash: ip.ip_hash })}>
                          <Eye className="size-4" /> Quitar
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => watchMut.mutate({ ip_hash: ip.ip_hash, reason: "Marcada desde panel" })}>
                          <EyeOff className="size-4" /> Marcar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {(ipsQ.data ?? []).length === 0 && !ipsQ.isLoading && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin IPs en el rango.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Las IPs se guardan como hash SHA-256 con sal por privacidad. Basta para agrupar por origen y detectar patrones sin exponer la IP real.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone,
}: { icon: typeof Activity; label: string; value: number | string; tone?: "warn" | "danger" }) {
  const color = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="glass rounded-xl border border-border/50 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</div>
    </div>
  );
}