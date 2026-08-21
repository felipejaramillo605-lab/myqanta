import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, MessageSquare, Phone, Mail, Calendar as CalIcon, StickyNote, Send, Loader2 } from "lucide-react";

import {
  DEAL_STAGES, type DealStage,
  listContacts, upsertContact, deleteContact,
  listDeals, upsertDeal, moveDealStage, deleteDeal,
  listActivities, addActivity, deleteActivity,
} from "@/lib/crm.functions";
import { getNotionConnection, listNotionDatabases, pushContactToNotion } from "@/lib/notion.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({ meta: [
    { title: "Qanta — CRM" },
    { name: "description", content: "Contactos, oportunidades y pipeline de ventas." },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["crm-contacts"], queryFn: () => listContacts() }),
      context.queryClient.ensureQueryData({ queryKey: ["crm-deals"], queryFn: () => listDeals() }),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: CRMPage,
});

type Contact = Awaited<ReturnType<typeof listContacts>>[number];
type Deal = Awaited<ReturnType<typeof listDeals>>[number];

const STAGE_LABEL: Record<DealStage, string> = {
  lead: "Lead",
  qualified: "Cualificado",
  proposal: "Propuesta",
  negotiation: "Negociación",
  won: "Ganado",
  lost: "Perdido",
};
const STAGE_COLOR: Record<DealStage, string> = {
  lead: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  qualified: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  proposal: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  negotiation: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  won: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  lost: "bg-rose-500/15 text-rose-500 border-rose-500/30",
};

function fmt(n: number, cur = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur }).format(Number(n) || 0);
}

function CRMPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
        <p className="text-sm text-muted-foreground">Contactos, oportunidades y pipeline visual.</p>
      </header>
      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="contacts">Contactos</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline"><PipelineView /></TabsContent>
        <TabsContent value="contacts"><ContactsView /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Pipeline ============
function PipelineView() {
  const qc = useQueryClient();
  const dealsFn = useServerFn(listDeals);
  const contactsFn = useServerFn(listContacts);
  const { data: deals } = useSuspenseQuery({ queryKey: ["crm-deals"], queryFn: () => dealsFn() });
  const { data: contacts } = useSuspenseQuery({ queryKey: ["crm-contacts"], queryFn: () => contactsFn() });
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  const moveFn = useServerFn(moveDealStage);
  const move = useMutation({
    mutationFn: (v: { id: string; stage: DealStage }) => moveFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-deals"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<Deal | null>(null);
  const [openNew, setOpenNew] = useState(false);

  const grouped = useMemo(() => {
    const g: Record<DealStage, Deal[]> = {
      lead: [], qualified: [], proposal: [], negotiation: [], won: [], lost: [],
    };
    for (const d of deals) g[d.stage].push(d);
    return g;
  }, [deals]);

  const totals = useMemo(() => {
    const t: Record<DealStage, number> = {
      lead: 0, qualified: 0, proposal: 0, negotiation: 0, won: 0, lost: 0,
    };
    for (const d of deals) t[d.stage] += Number(d.amount) || 0;
    return t;
  }, [deals]);

  // Pipeline ponderado: solo etapas abiertas, monto x probabilidad.
  const weighted = useMemo(() => {
    let open = 0;
    let w = 0;
    for (const d of deals) {
      if (d.stage === "won" || d.stage === "lost") continue;
      const amt = Number(d.amount) || 0;
      open += amt;
      w += (amt * (Number(d.probability) || 0)) / 100;
    }
    return { open, w };
  }, [deals]);

  const staleCut = useMemo(() => new Date(Date.now() - 14 * 86_400_000).toISOString(), []);
  const isStale = (d: Deal) => {
    const at = (d as { updated_at?: string | null }).updated_at;
    return !!at && at < staleCut && d.stage !== "won" && d.stage !== "lost";
  };
  const staleCount = deals.filter(isStale).length;

  const onDrop = (stage: DealStage) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    move.mutate({ id, stage });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="glass rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pipeline abierto</div>
          <div className="mt-1 font-mono text-xl font-semibold">{fmt(weighted.open)}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pipeline ponderado</div>
          <div className="mt-1 font-mono text-xl font-semibold text-primary">{fmt(weighted.w)}</div>
          <div className="text-[10px] text-muted-foreground">Monto × probabilidad</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ganado</div>
          <div className="mt-1 font-mono text-xl font-semibold">{fmt(totals.won)}</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sin actividad 14d</div>
          <div className={"mt-1 font-mono text-xl font-semibold " + (staleCount ? "text-destructive" : "")}>
            {staleCount}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {deals.length} oportunidades · {fmt(deals.reduce((s, d) => s + Number(d.amount) || 0, 0))}
        </div>
        <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="mr-2 size-4" />Nueva oportunidad</Button>
      </div>


      <div className="grid gap-3 lg:grid-cols-6">
        {DEAL_STAGES.map((s) => (
          <div
            key={s}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop(s)}
            className="glass min-h-[300px] rounded-xl p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <Badge variant="outline" className={STAGE_COLOR[s]}>{STAGE_LABEL[s]}</Badge>
              <span className="text-xs text-muted-foreground">{grouped[s].length} · {fmt(totals[s])}</span>
            </div>
            <div className="space-y-2">
              {grouped[s].map((d) => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
                  onClick={() => setEditing(d)}
                  className="cursor-grab rounded-lg border border-border/60 bg-background/60 p-3 text-sm hover:border-primary/60"
                >
                  <div className="font-medium">{d.title}</div>
                  {d.contact_id && contactMap.get(d.contact_id) && (
                    <div className="text-xs text-muted-foreground">{contactMap.get(d.contact_id)!.name}</div>
                  )}
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-xs">{fmt(Number(d.amount), d.currency)}</span>
                    <span className="text-[10px] text-muted-foreground">{d.probability}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(openNew || editing) && (
        <DealDialog
          open
          onClose={() => { setEditing(null); setOpenNew(false); }}
          deal={editing}
          contacts={contacts}
        />
      )}
    </div>
  );
}

function DealDialog({
  open, onClose, deal, contacts,
}: { open: boolean; onClose: () => void; deal: Deal | null; contacts: Contact[] }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertDeal);
  const deleteFn = useServerFn(deleteDeal);

  const [form, setForm] = useState(() => ({
    id: deal?.id,
    title: deal?.title ?? "",
    contact_id: deal?.contact_id ?? null,
    stage: (deal?.stage ?? "lead") as DealStage,
    amount: Number(deal?.amount ?? 0),
    currency: deal?.currency ?? "EUR",
    probability: deal?.probability ?? 20,
    expected_close_date: deal?.expected_close_date ?? "",
    notes: deal?.notes ?? "",
    lost_reason: deal?.lost_reason ?? "",
  }));

  const save = useMutation({
    mutationFn: () => upsertFn({ data: {
      id: form.id,
      title: form.title,
      contact_id: form.contact_id || null,
      stage: form.stage,
      amount: form.amount,
      currency: form.currency,
      probability: form.probability,
      expected_close_date: form.expected_close_date || null,
      notes: form.notes || null,
      lost_reason: form.stage === "lost" ? form.lost_reason || null : null,
    } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-deals"] });
      toast.success("Oportunidad guardada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id: deal!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-deals"] });
      toast.success("Eliminada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{deal ? "Editar oportunidad" : "Nueva oportunidad"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Título</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label>Contacto</Label>
            <Select value={form.contact_id ?? "_none"} onValueChange={(v) => setForm({ ...form, contact_id: v === "_none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Sin contacto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Ninguno —</SelectItem>
                {contacts.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Etapa</Label>
            <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as DealStage })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monto</Label>
            <Input type="number" step="0.01" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Moneda</Label>
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <Label>Probabilidad (%)</Label>
            <Input type="number" min={0} max={100} value={form.probability}
              onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Cierre esperado</Label>
            <Input type="date" value={form.expected_close_date ?? ""}
              onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
          </div>
          {form.stage === "lost" && (
            <div className="sm:col-span-2">
              <Label>Motivo de pérdida</Label>
              <Input value={form.lost_reason} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })} />
            </div>
          )}
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        {deal && <ActivityPanel dealId={deal.id} />}
        <DialogFooter className="gap-2">
          {deal && (
            <Button variant="ghost" className="text-destructive" onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="mr-2 size-4" />Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Activities ============
const KIND_ICON: Record<string, typeof MessageSquare> = {
  note: StickyNote, call: Phone, email: Mail, meeting: CalIcon, task: MessageSquare,
};
function ActivityPanel({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listActivities);
  const addFn = useServerFn(addActivity);
  const delFn = useServerFn(deleteActivity);
  const { data = [] } = useQuery({
    queryKey: ["crm-activities", dealId],
    queryFn: () => listFn({ data: { deal_id: dealId } }),
  });
  const [kind, setKind] = useState<"note"|"call"|"email"|"meeting"|"task">("note");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: () => addFn({ data: { deal_id: dealId, kind, subject: subject || null, body: body || null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-activities", dealId] });
      setSubject(""); setBody("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-activities", dealId] }),
  });

  return (
    <div className="mt-4 space-y-3 border-t border-border/40 pt-4">
      <div className="text-sm font-medium">Actividad</div>
      <div className="flex flex-wrap gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="note">Nota</SelectItem>
            <SelectItem value="call">Llamada</SelectItem>
            <SelectItem value="email">Correo</SelectItem>
            <SelectItem value="meeting">Reunión</SelectItem>
            <SelectItem value="task">Tarea</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Asunto" value={subject} onChange={(e) => setSubject(e.target.value)} className="flex-1 min-w-[160px]" />
        <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>Añadir</Button>
      </div>
      <Textarea rows={2} placeholder="Detalle…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="space-y-2">
        {data.map((a) => {
          const Icon = KIND_ICON[a.kind] ?? StickyNote;
          return (
            <div key={a.id} className="flex items-start gap-2 rounded-lg border border-border/40 p-2 text-sm">
              <Icon className="mt-0.5 size-4 text-muted-foreground" />
              <div className="flex-1">
                {a.subject && <div className="font-medium">{a.subject}</div>}
                {a.body && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{a.body}</div>}
                <div className="mt-1 text-[10px] text-muted-foreground">{new Date(a.occurred_at).toLocaleString("es-ES")}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(a.id)}><Trash2 className="size-3" /></Button>
            </div>
          );
        })}
        {data.length === 0 && <div className="text-xs text-muted-foreground">Sin actividad todavía.</div>}
      </div>
    </div>
  );
}

// ============ Contacts ============
function ContactsView() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContacts);
  const upsertFn = useServerFn(upsertContact);
  const delFn = useServerFn(deleteContact);
  const { data: contacts } = useSuspenseQuery({ queryKey: ["crm-contacts"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<Contact | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [notionContact, setNotionContact] = useState<Contact | null>(null);
  const notionStatusFn = useServerFn(getNotionConnection);
  const { data: notion } = useQuery({ queryKey: ["notion-connection"], queryFn: () => notionStatusFn() });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return contacts;
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(s) ||
      (c.company ?? "").toLowerCase().includes(s) ||
      (c.email ?? "").toLowerCase().includes(s));
  }, [contacts, q]);

  const save = useMutation({
    mutationFn: (v: Partial<Contact>) => upsertFn({ data: v as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contacts"] });
      toast.success("Contacto guardado");
      setEditing(null); setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-contacts"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <div className="flex-1" />
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 size-4" />Nuevo contacto</Button>
      </div>
      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Nombre</th><th className="p-3">Empresa</th><th className="p-3">Email</th>
              <th className="p-3">Teléfono</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-border/40">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3">{c.company ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{c.email ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{c.phone ?? "—"}</td>
                <td className="p-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="size-4" /></Button>
                  {notion?.connected && (
                    <Button variant="ghost" size="icon" title="Enviar a Notion" onClick={() => setNotionContact(c)}>
                      <Send className="size-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => del.mutate(c.id)}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td className="p-6 text-center text-muted-foreground" colSpan={5}>Sin contactos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <ContactDialog contact={editing} onClose={() => { setEditing(null); setOpen(false); }} onSave={(v) => save.mutate(v)} saving={save.isPending} />}
      {notionContact && (
        <NotionPushDialog contact={notionContact} onClose={() => setNotionContact(null)} />
      )}
    </div>
  );
}

function NotionPushDialog({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const listDbFn = useServerFn(listNotionDatabases);
  const pushFn = useServerFn(pushContactToNotion);
  const [dbId, setDbId] = useState("");
  const { data: dbs, isLoading, error } = useQuery({
    queryKey: ["notion-databases"],
    queryFn: () => listDbFn(),
  });
  const push = useMutation({
    mutationFn: () => pushFn({ data: { contact_id: contact.id, database_id: dbId } }),
    onSuccess: () => { toast.success("Contacto enviado a Notion"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enviar «{contact.name}» a Notion</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando bases de datos…</p>}
          {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
          {dbs && dbs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay bases de datos compartidas con Qanta. Comparte una desde Notion y vuelve a intentarlo.
            </p>
          )}
          {dbs && dbs.length > 0 && (
            <div>
              <Label>Base de datos destino</Label>
              <Select value={dbId} onValueChange={setDbId}>
                <SelectTrigger><SelectValue placeholder="Elige una base de datos" /></SelectTrigger>
                <SelectContent>
                  {dbs.map((d) => (<SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => push.mutate()} disabled={!dbId || push.isPending}>
            {push.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({
  contact, onClose, onSave, saving,
}: {
  contact: Contact | null; onClose: () => void;
  onSave: (v: Partial<Contact>) => void; saving: boolean;
}) {
  const [f, setF] = useState(() => ({
    id: contact?.id,
    name: contact?.name ?? "",
    company: contact?.company ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    title: contact?.title ?? "",
    source: contact?.source ?? "",
    notes: contact?.notes ?? "",
  }));
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{contact ? "Editar contacto" : "Nuevo contacto"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Nombre</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Empresa</Label><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
          <div><Label>Cargo</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><Label>Teléfono</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Fuente</Label><Input placeholder="p.ej. referido, web…" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Notas</Label><Textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={saving || !f.name.trim()} onClick={() => onSave({
            id: f.id, name: f.name, company: f.company || null, email: f.email || null,
            phone: f.phone || null, title: f.title || null, source: f.source || null, notes: f.notes || null,
          } as never)}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}