import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, BookOpen, Plus, Trash2, Pencil, EyeOff, Eye, X, Sparkles, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listAccountingPolicies,
  upsertAccountingPolicy,
  deleteAccountingPolicy,
  seedAccountingPolicies,
  type AccountingPolicy,
} from "@/lib/accounting-policies.functions";
import {
  listJournalTemplates,
  upsertJournalTemplate,
  deleteJournalTemplate,
  toggleJournalTemplateActive,
  type JournalTemplate,
  type TemplateLine,
} from "@/lib/journal-templates.functions";

export const Route = createFileRoute("/_authenticated/finance_/policies")({
  head: () => ({
    meta: [
      { title: "Qanta — Políticas contables" },
      { name: "description", content: "Define y edita las políticas contables de tu organización (US GAAP o NIIF)." },
      { property: "og:title", content: "Qanta — Políticas contables" },
      { property: "og:description", content: "Políticas contables editables con plantillas US GAAP y NIIF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PoliciesPage,
});

function PoliciesPage() {
  const [tplOpen, setTplOpen] = useState(false);
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["accounting-policies"], queryFn: () => listAccountingPolicies() });
  const policies = listQ.data ?? [];

  const seedM = useMutation({
    mutationFn: (template: "blank" | "us_gaap" | "niif") => seedAccountingPolicies({ data: { template } }),
    onSuccess: () => { toast.success("Políticas inicializadas"); qc.invalidateQueries({ queryKey: ["accounting-policies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => deleteAccountingPolicy({ data: { id } }),
    onSuccess: () => { toast.success("Política eliminada"); qc.invalidateQueries({ queryKey: ["accounting-policies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<AccountingPolicy | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Políticas contables</h1>
        <div className="flex gap-2">
          {policies.length > 0 && (
            <Button onClick={() => { setEditing(null); setEditorOpen(true); }}>
              <Plus className="size-4 mr-1" /> Agregar política
            </Button>
          )}
          <Button variant="outline" onClick={() => setTplOpen(true)}>
            <BookOpen className="size-4 mr-1" /> Plantillas de asientos
          </Button>
        </div>
      </div>

      {listQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : policies.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { key: "blank", icon: FileText, title: "Empezar desde cero", desc: "Crea tus propias políticas contables una por una, sin contenido precargado." },
            { key: "us_gaap", icon: Globe2, title: "Usar plantilla US GAAP", desc: "Set inicial basado en US GAAP: ASC 606, costo histórico, LIFO, consolidación y más." },
            { key: "niif", icon: Sparkles, title: "Usar plantilla NIIF", desc: "Set inicial basado en NIIF/IFRS: NIIF 15, NIIF 13, NIC 2, NIIF 16, NIC 36 y NIC 1." },
          ] as const).map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                disabled={seedM.isPending}
                onClick={() => seedM.mutate(opt.key)}
                className="glass rounded-2xl p-6 text-left space-y-3 hover:bg-accent/40 transition-colors disabled:opacity-60"
              >
                <Icon className="size-8 text-primary" />
                <div className="font-medium">{opt.title}</div>
                <p className="text-sm text-muted-foreground">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((p) => (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{p.title}</span>
                    {p.category !== "custom" && p.category !== "blank" && (
                      <Badge variant="secondary">{p.category === "us_gaap" ? "US GAAP" : "NIIF"}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {p.content || "Sin contenido todavía."}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => { setEditing(p); setEditorOpen(true); }}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" title="Eliminar"
                    onClick={() => { if (confirm(`¿Eliminar "${p.title}"?`)) delM.mutate(p.id); }}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PolicyEditorDialog
        open={editorOpen}
        onOpenChange={(o) => { setEditorOpen(o); if (!o) setEditing(null); }}
        initial={editing}
        nextIndex={policies.length}
      />
      <TemplatesDialog open={tplOpen} onOpenChange={setTplOpen} />
    </div>
  );
}

function PolicyEditorDialog({
  open, onOpenChange, initial, nextIndex,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: AccountingPolicy | null;
  nextIndex: number;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setContent(initial?.content ?? "");
  }, [open, initial]);

  const saveM = useMutation({
    mutationFn: () => upsertAccountingPolicy({
      data: {
        id: initial?.id,
        title: title.trim(),
        content: content.trim(),
        category: initial?.category ?? "custom",
        order_index: initial?.order_index ?? nextIndex,
        active: initial?.active ?? true,
      },
    }),
    onSuccess: () => {
      toast.success("Política guardada");
      qc.invalidateQueries({ queryKey: ["accounting-policies"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar política" : "Nueva política"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea rows={8} placeholder="Contenido de la política" value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!title.trim() || saveM.isPending} onClick={() => saveM.mutate()}>
            {saveM.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyLine(step: "accrual" | "payment", order_index: number, side: "debit" | "credit" = "debit"): TemplateLine {
  return { step, account_code: "", account_name: "", side, amount_formula: "total", order_index };
}

function TemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["journal-templates"], queryFn: () => listJournalTemplates(), enabled: open });
  const [editing, setEditing] = useState<JournalTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const delM = useMutation({
    mutationFn: (id: string) => deleteJournalTemplate({ data: { id } }),
    onSuccess: () => { toast.success("Plantilla eliminada"); qc.invalidateQueries({ queryKey: ["journal-templates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleM = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggleJournalTemplateActive({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["journal-templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4" /> Plantillas de asientos (NIIF)
          </DialogTitle>
        </DialogHeader>

        {showEditor ? (
          <TemplateEditor
            initial={editing}
            onDone={() => { setShowEditor(false); setEditing(null); qc.invalidateQueries({ queryKey: ["journal-templates"] }); }}
            onCancel={() => { setShowEditor(false); setEditing(null); }}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setEditing(null); setShowEditor(true); }}>
                <Plus className="size-4 mr-1" /> Nueva plantilla
              </Button>
            </div>
            {listQ.isLoading && <div className="text-sm text-muted-foreground">Cargando…</div>}
            <div className="space-y-2">
              {(listQ.data ?? []).map((t) => (
                <div key={t.id} className="glass rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{t.name}</span>
                        {t.is_predefined && <Badge variant="secondary">Predefinida</Badge>}
                        {!t.is_active && <Badge variant="outline">Inactiva</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{t.niif_category}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!t.is_predefined && (
                        <>
                          <Button size="icon" variant="ghost" title={t.is_active ? "Desactivar" : "Activar"}
                            onClick={() => toggleM.mutate({ id: t.id, is_active: !t.is_active })}>
                            {t.is_active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </Button>
                          <Button size="icon" variant="ghost" title="Editar"
                            onClick={() => { setEditing(t); setShowEditor(true); }}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Eliminar"
                            onClick={() => { if (confirm(`¿Eliminar "${t.name}"?`)) delM.mutate(t.id); }}>
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {(["accrual", "payment"] as const).map((step) => {
                      const rows = t.lines.filter((l) => l.step === step);
                      if (!rows.length) return null;
                      return (
                        <div key={step} className="rounded-lg border border-border/40 p-2">
                          <div className="font-medium text-muted-foreground mb-1">
                            {step === "accrual" ? "Causación" : "Pago"}
                          </div>
                          {rows.map((l, i) => (
                            <div key={i} className="flex justify-between font-mono">
                              <span>{l.side === "debit" ? "DR" : "CR"} · {l.account_code ? `${l.account_code} · ` : ""}{l.account_name}</span>
                              <span className="text-muted-foreground">{l.amount_formula}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!listQ.isLoading && !(listQ.data ?? []).length && (
                <div className="text-sm text-muted-foreground text-center py-6">Sin plantillas.</div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditor({
  initial,
  onDone,
  onCancel,
}: {
  initial: JournalTemplate | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.niif_category ?? "");
  const [lines, setLines] = useState<TemplateLine[]>(
    initial?.lines?.length
      ? initial.lines
      : [emptyLine("accrual", 0, "debit"), emptyLine("accrual", 1, "credit"), emptyLine("payment", 0, "debit"), emptyLine("payment", 1, "credit")],
  );
  const saveM = useMutation({
    mutationFn: () => upsertJournalTemplate({ data: { id: initial?.id, name: name.trim(), niif_category: category.trim(), is_active: initial?.is_active ?? true, lines } }),
    onSuccess: () => { toast.success("Plantilla guardada"); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const canSave = name.trim() && category.trim() && lines.length >= 2 && lines.every((l) => l.account_name.trim());
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Categoría NIIF (ej. NIC 2, NIC 16)" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      {(["accrual", "payment"] as const).map((step) => {
        const stepLines = lines.map((l, idx) => ({ l, idx })).filter(({ l }) => l.step === step);
        return (
          <div key={step} className="rounded-lg border border-border/40 p-2 space-y-2">
            <div className="flex justify-between items-center">
              <div className="text-xs font-medium">{step === "accrual" ? "Causación" : "Pago / cancelación"}</div>
              <Button size="sm" variant="ghost" onClick={() => setLines((xs) => [...xs, emptyLine(step, stepLines.length)])}>
                <Plus className="size-3 mr-1" /> Línea
              </Button>
            </div>
            {stepLines.map(({ l, idx }) => (
              <div key={idx} className="grid grid-cols-12 gap-1 items-center">
                <Input className="col-span-2" placeholder="Cód." value={l.account_code ?? ""} onChange={(e) => setLines((xs) => xs.map((x, i) => i === idx ? { ...x, account_code: e.target.value } : x))} />
                <Input className="col-span-5" placeholder="Nombre de cuenta" value={l.account_name} onChange={(e) => setLines((xs) => xs.map((x, i) => i === idx ? { ...x, account_name: e.target.value } : x))} />
                <Select value={l.side} onValueChange={(v: any) => setLines((xs) => xs.map((x, i) => i === idx ? { ...x, side: v } : x))}>
                  <SelectTrigger className="col-span-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Débito</SelectItem>
                    <SelectItem value="credit">Crédito</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="col-span-2" placeholder="Monto" value={l.amount_formula} onChange={(e) => setLines((xs) => xs.map((x, i) => i === idx ? { ...x, amount_formula: e.target.value } : x))} />
                <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setLines((xs) => xs.filter((_, i) => i !== idx))}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        );
      })}
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button disabled={!canSave || saveM.isPending} onClick={() => saveM.mutate()}>
          {saveM.isPending ? "Guardando…" : "Guardar plantilla"}
        </Button>
      </DialogFooter>
    </div>
  );
}