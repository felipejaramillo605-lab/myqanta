import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, UserCircle2, Mail, Phone, Hash, Briefcase, Check, X, Copy, IdCard, Loader2 } from "lucide-react";

import {
  approveEmployeeRequest,
  deleteTeamMember,
  listPendingEmployeeRequests,
  listTeamMembers,
  rejectEmployeeRequest,
  requestEmployeeCreation,
  updateMyPhoto,
  upsertTeamMember,
} from "@/lib/team.functions";
import { listMyOrgs } from "@/lib/org.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PhotoUpload } from "@/components/photo-upload";
import { EmployeeCardDialog } from "@/components/employee-card-dialog";
import { OrgAccessPanel } from "@/components/org-access-panel";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Qanta — Equipo" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({ queryKey: ["team"], queryFn: () => listTeamMembers() });
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: TeamPage,
});

type Member = {
  id: string;
  code: string;
  full_name: string;
  position: string | null;
  phone_e164: string | null;
  email: string | null;
  notes: string | null;
  archived: boolean;
  cedula: string | null;
  employee_id: string | null;
  photo_url: string | null;
  status: string | null;
};

function TeamPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">DIRECTORY · TEAM</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Equipo</h1>
      </header>
      <Tabs defaultValue="directory">
        <TabsList>
          <TabsTrigger value="directory">Directorio</TabsTrigger>
          <TabsTrigger value="org">Organización y accesos</TabsTrigger>
        </TabsList>
        <TabsContent value="directory" className="mt-4">
          <DirectoryTab />
        </TabsContent>
        <TabsContent value="org" className="mt-4">
          <OrgAccessPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DirectoryTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTeamMembers);
  const saveFn = useServerFn(upsertTeamMember);
  const delFn = useServerFn(deleteTeamMember);
  const photoFn = useServerFn(updateMyPhoto);
  const { data: members } = useSuspenseQuery({ queryKey: ["team"], queryFn: () => listFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] });
  const [card, setCard] = useState<Member | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Gestiona los miembros de tu equipo. Los recordatorios se enviarán al correo registrado aquí.
          Las altas nuevas se envían al propietario para su aprobación.
        </p>
        <NewEmployeeRequestDialog />
      </div>

      <PendingRequestsSection />

      <MyPhotoSection onSave={(url) => photoFn({ data: { photo_url: url } }).then(() => { refresh(); toast.success("Foto actualizada"); }).catch((e: Error) => toast.error(e.message))} />

      {members.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Aún no hay miembros. Añade el primero para empezar.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(members as Member[]).map((m) => (
            <div key={m.id} className="glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    title="Ver tarjeta de empleado"
                    onClick={() => setCard(m)}
                    className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-primary transition hover:ring-2 hover:ring-primary/40"
                  >
                    {m.photo_url ? (
                      <img src={m.photo_url} alt={m.full_name} className="size-10 object-cover" />
                    ) : (
                      <UserCircle2 className="size-5" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.full_name}</div>
                    {m.position && <div className="truncate text-xs text-muted-foreground">{m.position}</div>}
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">{m.code}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {m.employee_id && <div className="flex items-center gap-2 font-mono"><IdCard className="size-3" /> {m.employee_id}</div>}
                {m.email && <div className="flex items-center gap-2"><Mail className="size-3" /> {m.email}</div>}
                {m.phone_e164 && <div className="flex items-center gap-2"><Phone className="size-3" /> {m.phone_e164}</div>}
                {m.notes && <div className="mt-1 line-clamp-2 text-[11px]">{m.notes}</div>}
              </div>
              {m.status === "pending_approval" && (
                <Badge variant="secondary" className="mt-2 text-[10px]">Pendiente de aprobación</Badge>
              )}
              <div className="mt-3 flex justify-end gap-1">
                <MemberDialog
                  initial={m}
                  trigger={<Button size="icon" variant="ghost"><Pencil className="size-4" /></Button>}
                  onSave={(v) => saveFn({ data: { ...v, id: m.id } }).then(() => { refresh(); toast.success("Actualizado"); }).catch((e: Error) => toast.error(e.message))}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (!confirm(`Eliminar a ${m.full_name}?`)) return;
                    delFn({ data: { id: m.id } }).then(() => { refresh(); toast.success("Eliminado"); }).catch((e: Error) => toast.error(e.message));
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EmployeeCardDialog open={!!card} onOpenChange={(o) => !o && setCard(null)} member={card} />
    </div>
  );
}

function MyPhotoSection({ onSave }: { onSave: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <div className="text-sm">
        <div className="font-medium">Mi foto de perfil</div>
        <p className="text-xs text-muted-foreground">Actualiza la foto que aparece en tu tarjeta de empleado.</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">Cambiar foto</Button>
        </DialogTrigger>
        <DialogContent className="glass max-w-sm">
          <DialogHeader><DialogTitle>Mi foto</DialogTitle></DialogHeader>
          <PhotoUpload onUploaded={(url) => { onSave(url); setOpen(false); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingRequestsSection() {
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => listMyOrgs() });
  const isOwner = orgsQ.data?.orgs.find((o) => o.id === orgsQ.data?.activeOrgId)?.role === "owner";
  const listFn = useServerFn(listPendingEmployeeRequests);
  const approveFn = useServerFn(approveEmployeeRequest);
  const rejectFn = useServerFn(rejectEmployeeRequest);
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingQ = useQuery({
    queryKey: ["team-pending"],
    queryFn: () => listFn(),
    enabled: !!isOwner,
    retry: false,
  });

  if (!isOwner) return null;
  const rows = pendingQ.data ?? [];

  const approve = (id: string) => {
    setBusyId(id);
    approveFn({ data: { id } })
      .then((r) => {
        setCredentials({ email: r.email, tempPassword: r.tempPassword });
        qc.invalidateQueries({ queryKey: ["team-pending"] });
        qc.invalidateQueries({ queryKey: ["team"] });
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusyId(null));
  };

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="mb-3 font-medium">Solicitudes pendientes</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes pendientes de aprobación.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium">{r.full_name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {r.position ?? "—"} · {r.email ?? "—"} · CC {r.cedula ?? "—"} · rol {r.requested_role ?? "member"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={() => approve(r.id)} disabled={busyId === r.id}>
                  {busyId === r.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Aprobar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    rejectFn({ data: { id: r.id } })
                      .then(() => { qc.invalidateQueries({ queryKey: ["team-pending"] }); toast.success("Solicitud rechazada"); })
                      .catch((e: Error) => toast.error(e.message))
                  }
                >
                  <X className="size-4" /> Rechazar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!credentials} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent className="glass max-w-md">
          <DialogHeader><DialogTitle>Empleado aprobado</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta contraseña temporal se muestra <strong>una sola vez</strong>. Compártela con el empleado; deberá
            cambiarla en su primer ingreso.
          </p>
          <div className="rounded-lg border border-border/50 bg-background/60 p-3 text-sm">
            <div className="font-mono text-xs text-muted-foreground">{credentials?.email}</div>
            <div className="mt-1 font-mono text-lg">{credentials?.tempPassword}</div>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              navigator.clipboard?.writeText(credentials?.tempPassword ?? "").then(() => toast.success("Copiado"));
            }}
          >
            <Copy className="size-4" /> Copiar contraseña
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function NewEmployeeRequestDialog() {
  const qc = useQueryClient();
  const requestFn = useServerFn(requestEmployeeCreation);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    full_name: "",
    cedula: "",
    position: "",
    phone_e164: "",
    email: "",
    notes: "",
    photo_url: "",
    role: "member" as "member" | "viewer",
  });

  const submit = () => {
    setBusy(true);
    requestFn({
      data: {
        full_name: f.full_name.trim(),
        cedula: f.cedula.trim(),
        position: f.position.trim() || null,
        phone_e164: f.phone_e164.trim() || null,
        email: f.email.trim(),
        notes: f.notes.trim() || null,
        photo_url: f.photo_url || null,
        role: f.role,
      },
    })
      .then(() => {
        toast.success("Solicitud enviada al propietario para aprobación");
        setOpen(false);
        setF({ full_name: "", cedula: "", position: "", phone_e164: "", email: "", notes: "", photo_url: "", role: "member" });
        qc.invalidateQueries({ queryKey: ["team-pending"] });
        qc.invalidateQueries({ queryKey: ["team"] });
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" />Nuevo empleado</Button>
      </DialogTrigger>
      <DialogContent className="glass max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Solicitud de alta de empleado</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Nombre completo</Label>
              <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Cédula</Label>
              <Input value={f.cedula} onChange={(e) => setF({ ...f, cedula: e.target.value })} placeholder="1020304050" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs flex items-center gap-1"><Briefcase className="size-3" /> Cargo</Label>
              <Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Rol de acceso</Label>
              <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as "member" | "viewer" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Miembro</SelectItem>
                  <SelectItem value="viewer">Solo lectura</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs flex items-center gap-1"><Mail className="size-3" /> Correo</Label>
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Phone className="size-3" /> Teléfono (E.164)</Label>
              <Input value={f.phone_e164} onChange={(e) => setF({ ...f, phone_e164: e.target.value })} placeholder="+34612345678" />
            </div>
          </div>
          <PhotoUpload value={f.photo_url || null} onUploaded={(url) => setF({ ...f, photo_url: url })} label="Foto (opcional)" />
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={busy || !f.full_name.trim() || f.cedula.trim().length < 4 || !f.email.trim()} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function genCode() {
  return "EMP-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function MemberDialog({
  onSave,
  initial,
  trigger,
}: {
  onSave: (v: { code: string; full_name: string; cedula: string; position: string | null; phone_e164: string | null; email: string | null; notes: string | null; photo_url: string | null }) => void;
  initial?: Member;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    code: initial?.code ?? genCode(),
    full_name: initial?.full_name ?? "",
    cedula: initial?.cedula ?? "",
    position: initial?.position ?? "",
    phone_e164: initial?.phone_e164 ?? "",
    email: initial?.email ?? "",
    notes: initial?.notes ?? "",
    photo_url: initial?.photo_url ?? "",
  });
  const isEdit = !!initial;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && !isEdit) setF({ code: genCode(), full_name: "", cedula: "", position: "", phone_e164: "", email: "", notes: "", photo_url: "" }); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus className="size-4" />Nuevo miembro</Button>}
      </DialogTrigger>
      <DialogContent className="glass max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar miembro" : "Nuevo miembro"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs flex items-center gap-1"><Hash className="size-3" /> ID único</Label>
              <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="EMP-A1B2C" />
              <p className="mt-1 text-[10px] text-muted-foreground">2-32 caracteres. Letras, números, _ o -.</p>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Briefcase className="size-3" /> Cargo</Label>
              <Input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="Diseñador, Cajera…" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Nombre completo</Label>
              <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Cédula</Label>
              <Input value={f.cedula} onChange={(e) => setF({ ...f, cedula: e.target.value })} placeholder="1020304050" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs flex items-center gap-1"><Mail className="size-3" /> Correo para recordatorios</Label>
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="persona@empresa.com" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Phone className="size-3" /> Teléfono (E.164)</Label>
              <Input value={f.phone_e164} onChange={(e) => setF({ ...f, phone_e164: e.target.value })} placeholder="+34612345678" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
          <PhotoUpload value={f.photo_url || null} onUploaded={(url) => setF({ ...f, photo_url: url })} label="Foto" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={!f.full_name.trim() || !f.code.trim() || f.cedula.trim().length < 4}
            onClick={() => {
              onSave({
                code: f.code.trim(),
                full_name: f.full_name.trim(),
                cedula: f.cedula.trim(),
                position: f.position.trim() || null,
                phone_e164: f.phone_e164.trim() || null,
                email: f.email.trim() || null,
                notes: f.notes.trim() || null,
                photo_url: f.photo_url || null,
              });
              setOpen(false);
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
