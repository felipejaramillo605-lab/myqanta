import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, UserCircle2, Mail, Phone, Hash, Briefcase } from "lucide-react";

import { deleteTeamMember, listTeamMembers, upsertTeamMember } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
};

function TeamPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTeamMembers);
  const saveFn = useServerFn(upsertTeamMember);
  const delFn = useServerFn(deleteTeamMember);
  const { data: members } = useSuspenseQuery({ queryKey: ["team"], queryFn: () => listFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">DIRECTORY · TEAM</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Equipo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestiona los miembros de tu equipo. Los recordatorios se enviarán al correo registrado aquí.
          </p>
        </div>
        <MemberDialog onSave={(v) => saveFn({ data: v }).then(() => { refresh(); toast.success("Guardado"); }).catch((e: Error) => toast.error(e.message))} />
      </header>

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
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <UserCircle2 className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.full_name}</div>
                    {m.position && <div className="truncate text-xs text-muted-foreground">{m.position}</div>}
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">{m.code}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {m.email && <div className="flex items-center gap-2"><Mail className="size-3" /> {m.email}</div>}
                {m.phone_e164 && <div className="flex items-center gap-2"><Phone className="size-3" /> {m.phone_e164}</div>}
                {m.notes && <div className="mt-1 line-clamp-2 text-[11px]">{m.notes}</div>}
              </div>
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
    </div>
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
  onSave: (v: { code: string; full_name: string; position: string | null; phone_e164: string | null; email: string | null; notes: string | null }) => void;
  initial?: Member;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    code: initial?.code ?? genCode(),
    full_name: initial?.full_name ?? "",
    position: initial?.position ?? "",
    phone_e164: initial?.phone_e164 ?? "",
    email: initial?.email ?? "",
    notes: initial?.notes ?? "",
  });
  const isEdit = !!initial;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && !isEdit) setF({ code: genCode(), full_name: "", position: "", phone_e164: "", email: "", notes: "" }); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button><Plus className="size-4" />Nuevo miembro</Button>}
      </DialogTrigger>
      <DialogContent className="glass max-w-lg">
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
          <div>
            <Label className="text-xs">Nombre completo</Label>
            <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={!f.full_name.trim() || !f.code.trim()}
            onClick={() => {
              onSave({
                code: f.code.trim(),
                full_name: f.full_name.trim(),
                position: f.position.trim() || null,
                phone_e164: f.phone_e164.trim() || null,
                email: f.email.trim() || null,
                notes: f.notes.trim() || null,
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
