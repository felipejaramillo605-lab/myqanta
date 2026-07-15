import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, MessageSquare, CheckCircle2, XCircle, Eye, Clock, Loader2, Trash2,
} from "lucide-react";

import {
  listApprovals,
  listApprovalComments,
  createApproval,
  decideApproval,
  addApprovalComment,
  deleteApproval,
} from "@/lib/approvals.functions";
import { listMembers } from "@/lib/org.functions";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ApprovalStatus = "pending" | "in_review" | "approved" | "rejected";

const STATUS_META: Record<ApprovalStatus, { label: string; badge: string; ring: string }> = {
  pending:   { label: "Pendiente",   badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",   ring: "border-amber-500/40" },
  in_review: { label: "En revisión", badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",         ring: "border-sky-500/40" },
  approved:  { label: "Aprobado",    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", ring: "border-emerald-500/40" },
  rejected:  { label: "Rechazado",   badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",       ring: "border-rose-500/40" },
};

const approvalsQuery = { queryKey: ["approvals", "list"] as const, queryFn: () => listApprovals() };
const membersQuery = { queryKey: ["org", "members-approvals"] as const, queryFn: () => listMembers() };

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Aprobaciones — Qanta" },
      { name: "description", content: "Bandeja de entrada universal de aprobaciones y tareas asignadas." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(approvalsQuery),
      context.queryClient.ensureQueryData(membersQuery),
    ]);
  },
  component: ApprovalsPage,
});

type MemberEntry = { user_id: string; full_name: string | null; role: string };

function ApprovalsPage() {
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const qc = useQueryClient();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filter, setFilter] = useState<"all" | "mine" | "assigned">("assigned");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: approvals } = useSuspenseQuery(approvalsQuery);
  const { data: memberInfo } = useSuspenseQuery(membersQuery);
  const members: MemberEntry[] = memberInfo.members ?? [];

  const memberName = (id: string) => {
    if (id === user?.id) return "Yo";
    const m = members.find((x) => x.user_id === id);
    return m?.full_name ?? id.slice(0, 8);
  };

  const filtered = useMemo(() => {
    if (!user) return approvals;
    if (filter === "mine") return approvals.filter((a) => a.requested_by === user.id);
    if (filter === "assigned") return approvals.filter((a) => a.assigned_to === user.id);
    return approvals;
  }, [approvals, filter, user]);

  const columns: ApprovalStatus[] = ["pending", "in_review", "approved", "rejected"];

  const decideFn = useServerFn(decideApproval);
  const deleteFn = useServerFn(deleteApproval);

  const decideMut = useMutation({
    mutationFn: (input: Parameters<typeof decideApproval>[0]) => decideFn(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Aprobación actualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      setSelectedId(null);
      toast.success("Aprobación eliminada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selected = filtered.find((a) => a.id === selectedId) ?? approvals.find((a) => a.id === selectedId);

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold sm:text-2xl">Aprobaciones</h1>
          <p className="text-sm text-muted-foreground">
            Motor genérico reutilizable — cualquier módulo (compras, legal, contable) crea aquí sus tareas de aprobación.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canWrite && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 size-4" /> Nueva</Button>
              </DialogTrigger>
              <CreateDialog
                onClose={() => setCreateOpen(false)}
                members={members}
              />
            </Dialog>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="assigned">Para aprobar</TabsTrigger>
            <TabsTrigger value="mine">Mis solicitudes</TabsTrigger>
            <TabsTrigger value="all">Todo</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto">
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList>
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
              <TabsTrigger value="list">Lista</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Sin aprobaciones para este filtro. Cuando otro módulo (compras, legal, etc.) envíe una solicitud, aparecerá aquí como tarea.
        </div>
      )}

      {view === "kanban" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((col) => {
            const items = filtered.filter((a) => a.status === col);
            const meta = STATUS_META[col];
            return (
              <section key={col} className={"rounded-2xl border bg-card/40 p-3 " + meta.ring}>
                <header className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{meta.label}</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px]">{items.length}</span>
                </header>
                <div className="space-y-2">
                  {items.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className="w-full rounded-xl border border-border/60 bg-background/60 p-3 text-left transition hover:border-primary/50 hover:bg-background"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-medium">{a.title}</p>
                        <Badge variant="outline" className="shrink-0 text-[10px]">{a.module}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>→ {memberName(a.assigned_to)}</span>
                        <span>·</span>
                        <span>por {memberName(a.requested_by)}</span>
                      </div>
                      {a.status === "rejected" && a.rejection_reason && (
                        <p className="mt-2 line-clamp-2 rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
                          {a.rejection_reason}
                        </p>
                      )}
                    </button>
                  ))}
                  {items.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border/40 py-4 text-center text-[11px] text-muted-foreground">
                      Vacío
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Título</th>
                <th className="px-3 py-2 text-left">Módulo</th>
                <th className="px-3 py-2 text-left">Asignado a</th>
                <th className="px-3 py-2 text-left">Solicitó</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-t border-border/40 hover:bg-secondary/30">
                  <td className="px-3 py-2 font-medium">{a.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.module}</td>
                  <td className="px-3 py-2">{memberName(a.assigned_to)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{memberName(a.requested_by)}</td>
                  <td className="px-3 py-2">
                    <Badge className={STATUS_META[a.status as ApprovalStatus].badge} variant="outline">
                      {STATUS_META[a.status as ApprovalStatus].label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(a.id)}>
                      Abrir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ApprovalDialog
          approval={selected}
          currentUserId={user?.id ?? ""}
          members={members}
          memberName={memberName}
          onClose={() => setSelectedId(null)}
          onDecide={(payload) => decideMut.mutate({ data: payload })}
          onDelete={() => deleteMut.mutate(selected.id)}
          decideBusy={decideMut.isPending}
          deleteBusy={deleteMut.isPending}
        />
      )}
    </div>
  );
}

function CreateDialog({ onClose, members }: { onClose: () => void; members: MemberEntry[] }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createApproval);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [module, setModule] = useState("custom");
  const [assignedTo, setAssignedTo] = useState<string>("");

  const mut = useMutation({
    mutationFn: (payload: Parameters<typeof createApproval>[0]) => createFn(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Aprobación creada y asignada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = title.trim().length > 0 && assignedTo.length > 0 && !mut.isPending;

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Nueva aprobación</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Módulo</Label>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Genérico</SelectItem>
              <SelectItem value="purchase_order">Pedido de compra</SelectItem>
              <SelectItem value="legal_contract">Contrato legal</SelectItem>
              <SelectItem value="journal_entry">Asiento contable</SelectItem>
              <SelectItem value="expense">Gasto / reembolso</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué se aprueba?" />
        </div>
        <div>
          <Label>Descripción</Label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto, monto, referencias…" />
        </div>
        <div>
          <Label>Aprobador asignado</Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger><SelectValue placeholder="Selecciona una persona" /></SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.user_id.slice(0, 8)} · {m.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Solo esta persona podrá aprobar o rechazar. Todos podrán ver y comentar.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button
          disabled={!canSubmit}
          onClick={() =>
            mut.mutate({
              data: {
                module,
                title: title.trim(),
                description: description.trim() || null,
                assigned_to: assignedTo,
              },
            })
          }
        >
          {mut.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
          Enviar a revisión
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ApprovalDialog({
  approval, currentUserId, memberName, onClose, onDecide, onDelete, decideBusy, deleteBusy,
}: {
  approval: Awaited<ReturnType<typeof listApprovals>>[number];
  currentUserId: string;
  members: MemberEntry[];
  memberName: (id: string) => string;
  onClose: () => void;
  onDecide: (p: { id: string; decision: "in_review" | "approved" | "rejected"; rejection_reason?: string | null }) => void;
  onDelete: () => void;
  decideBusy: boolean;
  deleteBusy: boolean;
}) {
  const qc = useQueryClient();
  const addCommentFn = useServerFn(addApprovalComment);
  const [comment, setComment] = useState("");
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const isApprover = approval.assigned_to === currentUserId;
  const meta = STATUS_META[approval.status as ApprovalStatus];
  const canModify = approval.status === "pending" || approval.status === "in_review";

  const commentsQuery = {
    queryKey: ["approvals", "comments", approval.id] as const,
    queryFn: () => listApprovalComments({ data: { approval_id: approval.id } }),
  };
  const { data: comments = [], isLoading: commentsLoading } = useSuspenseQuery(commentsQuery);

  const commentMut = useMutation({
    mutationFn: (body: string) => addCommentFn({ data: { approval_id: approval.id, body } }),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["approvals", "comments", approval.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">{approval.title}</DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline">{approval.module}</Badge>
                <Badge className={meta.badge} variant="outline">{meta.label}</Badge>
                <span>→ {memberName(approval.assigned_to)}</span>
                <span>· por {memberName(approval.requested_by)}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {approval.description && (
          <p className="whitespace-pre-wrap rounded-lg border border-border/50 bg-background/60 p-3 text-sm text-muted-foreground">
            {approval.description}
          </p>
        )}

        {approval.status === "rejected" && approval.rejection_reason && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            <strong>Motivo de rechazo:</strong> {approval.rejection_reason}
          </div>
        )}

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="size-4" /> Comentarios
          </h3>
          <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-border/40 bg-background/40 p-2">
            {commentsLoading && <p className="p-2 text-xs text-muted-foreground">Cargando…</p>}
            {!commentsLoading && comments.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">Sin comentarios. Sé el primero en escribir contexto.</p>
            )}
            {comments.map((c) => (
              <div key={c.id} className="rounded border border-border/40 bg-card/40 p-2 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-medium text-foreground">{memberName(c.author_id)}</span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Agrega un comentario…"
            />
            <Button
              disabled={!comment.trim() || commentMut.isPending}
              onClick={() => commentMut.mutate(comment.trim())}
            >
              Enviar
            </Button>
          </div>
        </section>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={deleteBusy}>
            <Trash2 className="mr-1 size-4" /> Eliminar
          </Button>
          {isApprover && canModify ? (
            <div className="flex flex-wrap gap-2">
              {approval.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decideBusy}
                  onClick={() => onDecide({ id: approval.id, decision: "in_review" })}
                >
                  <Eye className="mr-1 size-4" /> Marcar en revisión
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={decideBusy}
                onClick={() => setRejectionOpen(true)}
              >
                <XCircle className="mr-1 size-4" /> Rechazar
              </Button>
              <Button
                size="sm"
                disabled={decideBusy}
                onClick={() => onDecide({ id: approval.id, decision: "approved" })}
              >
                <CheckCircle2 className="mr-1 size-4" /> Aprobar
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {canModify ? (
                <>
                  <Clock className="mr-1 inline size-3" />
                  Solo <strong>{memberName(approval.assigned_to)}</strong> puede decidir.
                </>
              ) : (
                <>Decisión final: <strong>{meta.label}</strong>.</>
              )}
            </p>
          )}
        </DialogFooter>

        <Dialog open={rejectionOpen} onOpenChange={setRejectionOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Rechazar aprobación</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label>Motivo del rechazo</Label>
              <Textarea
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explica por qué se rechaza…"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRejectionOpen(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!rejectionReason.trim() || decideBusy}
                onClick={() => {
                  onDecide({
                    id: approval.id,
                    decision: "rejected",
                    rejection_reason: rejectionReason.trim(),
                  });
                  setRejectionOpen(false);
                  setRejectionReason("");
                }}
              >
                Confirmar rechazo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}