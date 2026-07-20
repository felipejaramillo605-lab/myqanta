import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listPlatformUsers,
  listPlatformOrganizations,
  setUserBlocked,
  listOrgMembers,
} from "@/lib/platform-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Ban, CheckCircle2, Search, Users, Building2, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/platform")({
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
  component: PlatformAdminPage,
});

function PlatformAdminPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const usersQ = useQuery({ queryKey: ["platform-users"], queryFn: () => listPlatformUsers() });
  const orgsQ = useQuery({ queryKey: ["platform-orgs"], queryFn: () => listPlatformOrganizations() });

  const toggle = useMutation({
    mutationFn: (v: { user_id: string; blocked: boolean; reason?: string | null }) =>
      setUserBlocked({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.blocked ? "Usuario bloqueado" : "Usuario reactivado");
      qc.invalidateQueries({ queryKey: ["platform-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const users = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = usersQ.data ?? [];
    if (!term) return list;
    return list.filter(
      (u) =>
        u.email?.toLowerCase().includes(term) ||
        (u.full_name ?? "").toLowerCase().includes(term),
    );
  }, [q, usersQ.data]);

  const orgs = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = orgsQ.data ?? [];
    if (!term) return list;
    return list.filter(
      (o) => o.name?.toLowerCase().includes(term) || o.slug?.toLowerCase().includes(term),
    );
  }, [q, orgsQ.data]);

  const totalBlocked = (usersQ.data ?? []).filter((u) => u.is_blocked).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consola de plataforma</h1>
          <p className="text-sm text-muted-foreground">
            Controla todos los usuarios y organizaciones. Bloquea o reactiva el acceso según el estado de membresía.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge variant="outline" className="gap-1"><Users className="size-3" /> {usersQ.data?.length ?? 0} usuarios</Badge>
          <Badge variant="outline" className="gap-1"><Building2 className="size-3" /> {orgsQ.data?.length ?? 0} organizaciones</Badge>
          <Badge variant={totalBlocked > 0 ? "destructive" : "outline"} className="gap-1"><Ban className="size-3" /> {totalBlocked} bloqueados</Badge>
        </div>
      </header>

      <div className="glass flex items-center gap-2 rounded-lg border border-border/50 p-2">
        <Search className="ml-2 size-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por email, nombre u organización…"
          className="border-0 bg-transparent focus-visible:ring-0"
        />
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="orgs">Organizaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="glass overflow-hidden rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Usuario</th>
                  <th className="p-3 text-left">Registro</th>
                  <th className="p-3 text-left">Último acceso</th>
                  <th className="p-3 text-left">Orgs</th>
                  <th className="p-3 text-left">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usersQ.isLoading && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Cargando…</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border/40">
                    <td className="p-3">
                      <div className="font-medium">{u.full_name ?? u.email}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}</td>
                    <td className="p-3">{u.org_count}</td>
                    <td className="p-3">
                      {u.is_blocked ? (
                        <div>
                          <Badge variant="destructive">Bloqueado</Badge>
                          {u.blocked_reason && <div className="mt-1 text-[10px] text-muted-foreground">{u.blocked_reason}</div>}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-emerald-500">Activo</Badge>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {u.is_blocked ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate({ user_id: u.id, blocked: false, reason: null })}
                        >
                          <CheckCircle2 className="size-4" /> Reactivar
                        </Button>
                      ) : (
                        <BlockDialog onConfirm={(reason) => toggle.mutate({ user_id: u.id, blocked: true, reason })}>
                          <Button size="sm" variant="destructive">
                            <Ban className="size-4" /> Bloquear
                          </Button>
                        </BlockDialog>
                      )}
                    </td>
                  </tr>
                ))}
                {!usersQ.isLoading && users.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="orgs" className="mt-4">
          <div className="glass overflow-hidden rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 w-8"></th>
                  <th className="p-3 text-left">Organización</th>
                  <th className="p-3 text-left">Industria</th>
                  <th className="p-3 text-left">Miembros</th>
                  <th className="p-3 text-left">Creada</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <OrgRow key={o.id} org={o} onToggleBlock={(user_id, blocked, reason) => toggle.mutate({ user_id, blocked, reason })} toggling={toggle.isPending} />
                ))}
                {!orgsQ.isLoading && orgs.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrgRow({
  org,
  onToggleBlock,
  toggling,
}: {
  org: { id: string; name: string; slug: string | null; industry: string | null; member_count: number; created_at: string };
  onToggleBlock: (user_id: string, blocked: boolean, reason: string | null) => void;
  toggling: boolean;
}) {
  const [open, setOpen] = useState(false);
  const membersQ = useQuery({
    queryKey: ["org-members", org.id],
    queryFn: () => listOrgMembers({ data: { org_id: org.id } }),
    enabled: open,
  });
  return (
    <>
      <tr className="border-t border-border/40 cursor-pointer hover:bg-secondary/20" onClick={() => setOpen((o) => !o)}>
        <td className="p-3">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
        <td className="p-3">
          <div className="font-medium">{org.name}</div>
          <div className="font-mono text-[10px] text-muted-foreground">{org.slug}</div>
        </td>
        <td className="p-3 text-muted-foreground">{org.industry ?? "—"}</td>
        <td className="p-3">{org.member_count}</td>
        <td className="p-3 text-muted-foreground">{new Date(org.created_at).toLocaleDateString()}</td>
      </tr>
      {open && (
        <tr className="border-t border-border/40 bg-secondary/10">
          <td colSpan={5} className="p-3">
            {membersQ.isLoading && <div className="text-xs text-muted-foreground">Cargando integrantes…</div>}
            {membersQ.data && membersQ.data.length === 0 && <div className="text-xs text-muted-foreground">Sin integrantes.</div>}
            <div className="grid gap-2">
              {(membersQ.data ?? []).map((m) => (
                <div key={m.user_id} className="flex items-center justify-between rounded-md border border-border/40 p-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.full_name ?? m.email ?? m.user_id}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">{m.email ?? m.user_id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{m.role}</Badge>
                    <span className="text-[10px] text-muted-foreground">Ingresó {new Date(m.joined_at).toLocaleDateString()}</span>
                    {m.is_blocked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggling}
                        onClick={(e) => { e.stopPropagation(); onToggleBlock(m.user_id, false, null); }}
                      >
                        <CheckCircle2 className="size-4" /> Reactivar
                      </Button>
                    ) : (
                      <BlockDialog onConfirm={(reason) => onToggleBlock(m.user_id, true, reason)}>
                        <Button size="sm" variant="destructive" onClick={(e) => e.stopPropagation()}>
                          <Ban className="size-4" /> Bloquear
                        </Button>
                      </BlockDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function BlockDialog({ children, onConfirm }: { children: React.ReactNode; onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Membresía pendiente de pago");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader>
          <DialogTitle>Bloquear acceso</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label className="text-xs">Motivo (visible para el usuario)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <p className="text-[10px] text-muted-foreground">
            El usuario será redirigido a una página de suspensión hasta que se reactive.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={() => { onConfirm(reason.trim() || "Acceso suspendido"); setOpen(false); }}>
            Confirmar bloqueo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}