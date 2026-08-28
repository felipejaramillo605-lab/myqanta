import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, XCircle, PlayCircle, Loader2, Settings2, Eye } from "lucide-react";

import {
  listLeaves, upsertLeave, deleteLeave, listHolidays,
  listPayrollRuns, generatePayrollRun, finalizePayrollRun, deletePayrollRun,
  listHrMembers, updateHrMember,
  LEAVE_KINDS, LEAVE_STATUSES,
  type LeaveKind, type LeaveStatus, type LeaveRow, type PayrollRow,
} from "@/lib/hr.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HrLeaveCalendar } from "@/components/hr-leave-calendar";
import { HrResumeReviews } from "@/components/hr-resume-reviews";
import { HrPayrollDetailDialog } from "@/components/hr-payroll-detail-dialog";
import { HrPayrollSettingsDialog } from "@/components/hr-payroll-settings-dialog";
import { HrSeveranceCalculator } from "@/components/hr-severance-calculator";


export const Route = createFileRoute("/_authenticated/hr")({
  head: () => ({ meta: [
    { title: "Qanta — RRHH" },
    { name: "description", content: "Ausencias, contratos y nómina básica." },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["hr-members"], queryFn: () => listHrMembers() }),
      context.queryClient.ensureQueryData({ queryKey: ["hr-leaves"], queryFn: () => listLeaves() }),
      context.queryClient.ensureQueryData({ queryKey: ["hr-payroll"], queryFn: () => listPayrollRuns() }),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: HrPage,
});

const KIND_LABEL: Record<LeaveKind, string> = {
  vacation: "Vacaciones",
  sick: "Baja médica",
  permission: "Permiso",
  unpaid: "Sin sueldo",
};
const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};
const STATUS_COLOR: Record<LeaveStatus, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-500 border-rose-500/30",
};

function HrPage() {
  const qc = useQueryClient();
  const membersQ = useSuspenseQuery({ queryKey: ["hr-members"], queryFn: () => listHrMembers() });
  const leavesQ = useSuspenseQuery({ queryKey: ["hr-leaves"], queryFn: () => listLeaves() });
  const holidaysQ = useQuery({
    queryKey: ["hr-holidays", new Date().getFullYear()],
    queryFn: () => listHolidays({ data: { year: new Date().getFullYear() } }),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const payrollQ = useSuspenseQuery({ queryKey: ["hr-payroll"], queryFn: () => listPayrollRuns() });

  const members = (membersQ.data ?? []) as any[];
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const [editingLeave, setEditingLeave] = useState<Partial<LeaveRow> | null>(null);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const now = new Date();
  const [period, setPeriod] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });

  const saveLeave = useMutation({
    mutationFn: (v: any) => upsertLeave({ data: v }),
    onSuccess: () => {
      toast.success("Solicitud guardada");
      qc.invalidateQueries({ queryKey: ["hr-leaves"] });
      setEditingLeave(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const removeLeave = useMutation({
    mutationFn: (id: string) => deleteLeave({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-leaves"] }),
  });
  const setLeaveStatus = useMutation({
    mutationFn: (v: { row: LeaveRow; status: LeaveStatus }) =>
      upsertLeave({ data: { ...v.row, status: v.status } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-leaves"] }),
  });

  const saveMember = useMutation({
    mutationFn: (v: any) => updateHrMember({ data: v }),
    onSuccess: () => {
      toast.success("Ficha actualizada");
      qc.invalidateQueries({ queryKey: ["hr-members"] });
      setEditingMember(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const genRun = useMutation({
    mutationFn: () => generatePayrollRun({ data: { period_year: period.y, period_month: period.m } }),
    onSuccess: () => {
      toast.success("Nómina generada en borrador");
      qc.invalidateQueries({ queryKey: ["hr-payroll"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const finalizeRun = useMutation({
    mutationFn: (id: string) => finalizePayrollRun({ data: { id } }),
    onSuccess: () => {
      toast.success("Nómina cerrada y contabilizada");
      qc.invalidateQueries({ queryKey: ["hr-payroll"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const removeRun = useMutation({
    mutationFn: (id: string) => deletePayrollRun({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-payroll"] }),
  });

  const openNewLeave = () =>
    setEditingLeave({
      member_id: members[0]?.id,
      kind: "vacation",
      status: "pending",
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
      days: 1,
    });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl">RRHH</h1>
          <p className="text-sm text-muted-foreground">Contratos, ausencias y nómina mensual.</p>
        </div>
      </header>

      <Tabs defaultValue="team" className="w-full">
        <TabsList>
          <TabsTrigger value="team">Personal</TabsTrigger>
          <TabsTrigger value="leaves">Ausencias</TabsTrigger>
          <TabsTrigger value="payroll">Nómina</TabsTrigger>
          <TabsTrigger value="resumes">Hojas de vida</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-4">
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Puesto</th>
                  <th className="px-3 py-2">Cédula</th>
                  <th className="px-3 py-2">Contrato</th>
                  <th className="px-3 py-2">Salario base</th>
                  <th className="px-3 py-2">Ingreso</th>
                  <th className="px-3 py-2">Vac. disp.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-border/40">
                    <td className="px-3 py-2">{m.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{m.position ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{m.cedula ?? "—"}</td>
                    <td className="px-3 py-2">{m.contract_type ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{m.salary_base != null ? Number(m.salary_base).toFixed(2) : "—"}</td>
                    <td className="px-3 py-2 font-mono">{m.hire_date ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{m.vacation_days_available ?? 0}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditingMember(m)}>Editar</Button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Añade personas en Equipo primero.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="leaves" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewLeave} disabled={members.length === 0}>
              <Plus className="mr-1 size-4" /> Nueva solicitud
            </Button>
          </div>
          <HrLeaveCalendar
            leaves={(leavesQ.data ?? []) as never}
            members={members as never}
            holidays={holidaysQ.data?.holidays ?? []}
          />

          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Miembro</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Desde</th>
                  <th className="px-3 py-2">Hasta</th>
                  <th className="px-3 py-2">Días</th>
                  <th className="px-3 py-2">Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {leavesQ.data.map((l) => (
                  <tr key={l.id} className="border-t border-border/40">
                    <td className="px-3 py-2">{memberById.get(l.member_id)?.full_name ?? "—"}</td>
                    <td className="px-3 py-2">{KIND_LABEL[l.kind]}</td>
                    <td className="px-3 py-2 font-mono">{l.start_date}</td>
                    <td className="px-3 py-2 font-mono">{l.end_date}</td>
                    <td className="px-3 py-2 font-mono">{l.days}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={STATUS_COLOR[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right space-x-1">
                      {l.status === "pending" && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => setLeaveStatus.mutate({ row: l, status: "approved" })} title="Aprobar">
                            <CheckCircle2 className="size-4 text-emerald-500" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setLeaveStatus.mutate({ row: l, status: "rejected" })} title="Rechazar">
                            <XCircle className="size-4 text-rose-500" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => removeLeave.mutate(l.id)} title="Eliminar">
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {leavesQ.data.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Sin solicitudes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="mt-4 space-y-3">
          <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
            <div>
              <Label className="text-xs">Año</Label>
              <Input type="number" className="w-24" value={period.y} onChange={(e) => setPeriod({ ...period, y: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Mes</Label>
              <Input type="number" min={1} max={12} className="w-20" value={period.m} onChange={(e) => setPeriod({ ...period, m: Number(e.target.value) })} />
            </div>
            <Button onClick={() => genRun.mutate()} disabled={genRun.isPending}>
              {genRun.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
              Generar borrador
            </Button>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Periodo</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Bruto</th>
                  <th className="px-3 py-2">Neto</th>
                  <th className="px-3 py-2">Personas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payrollQ.data.map((r: PayrollRow) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="px-3 py-2 font-mono">{r.period_year}-{String(r.period_month).padStart(2, "0")}</td>
                    <td className="px-3 py-2">{r.status === "finalized" ? "Cerrada" : "Borrador"}</td>
                    <td className="px-3 py-2 font-mono">{Number(r.total_gross).toFixed(2)}</td>
                    <td className="px-3 py-2 font-mono">{Number(r.total_net).toFixed(2)}</td>
                    <td className="px-3 py-2">{(r.details ?? []).length}</td>
                    <td className="px-3 py-2 text-right space-x-1">
                      {r.status === "draft" && (
                        <Button variant="ghost" size="sm" onClick={() => finalizeRun.mutate(r.id)}>
                          <PlayCircle className="mr-1 size-4" /> Cerrar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => removeRun.mutate(r.id)} title="Eliminar">
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {payrollQ.data.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Sin nóminas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="resumes" className="mt-4">
          <HrResumeReviews />
        </TabsContent>
      </Tabs>

      {/* Edit leave dialog */}
      <Dialog open={!!editingLeave} onOpenChange={(o) => !o && setEditingLeave(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitud de ausencia</DialogTitle></DialogHeader>
          {editingLeave && (
            <div className="grid gap-3">
              <div>
                <Label>Miembro</Label>
                <Select value={editingLeave.member_id ?? ""} onValueChange={(v) => setEditingLeave({ ...editingLeave, member_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={editingLeave.kind ?? "vacation"} onValueChange={(v) => setEditingLeave({ ...editingLeave, kind: v as LeaveKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAVE_KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estado</Label>
                  <Select value={editingLeave.status ?? "pending"} onValueChange={(v) => setEditingLeave({ ...editingLeave, status: v as LeaveStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Desde</Label>
                  <Input type="date" value={editingLeave.start_date ?? ""} onChange={(e) => setEditingLeave({ ...editingLeave, start_date: e.target.value })} />
                </div>
                <div>
                  <Label>Hasta</Label>
                  <Input type="date" value={editingLeave.end_date ?? ""} onChange={(e) => setEditingLeave({ ...editingLeave, end_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Días</Label>
                <Input type="number" min={0} step="0.5" value={editingLeave.days ?? 0} onChange={(e) => setEditingLeave({ ...editingLeave, days: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Motivo</Label>
                <Textarea value={editingLeave.reason ?? ""} onChange={(e) => setEditingLeave({ ...editingLeave, reason: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingLeave(null)}>Cancelar</Button>
            <Button onClick={() => editingLeave && saveLeave.mutate(editingLeave)} disabled={saveLeave.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit member HR dialog */}
      <Dialog open={!!editingMember} onOpenChange={(o) => !o && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ficha RRHH — {editingMember?.full_name}</DialogTitle></DialogHeader>
          {editingMember && (
            <div className="grid gap-3">
              <div>
                <Label>Tipo de contrato</Label>
                <Input value={editingMember.contract_type ?? ""} onChange={(e) => setEditingMember({ ...editingMember, contract_type: e.target.value })} placeholder="Indefinido, temporal, becario…" />
              </div>
              <div>
                <Label>Cédula (para marcar asistencia)</Label>
                <Input value={editingMember.cedula ?? ""} onChange={(e) => setEditingMember({ ...editingMember, cedula: e.target.value })} placeholder="Número de identificación" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Salario base</Label>
                  <Input type="number" step="0.01" value={editingMember.salary_base ?? ""} onChange={(e) => setEditingMember({ ...editingMember, salary_base: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Fecha ingreso</Label>
                  <Input type="date" value={editingMember.hire_date ?? ""} onChange={(e) => setEditingMember({ ...editingMember, hire_date: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Días vacaciones disponibles</Label>
                <Input type="number" min={0} value={editingMember.vacation_days_available ?? 0} onChange={(e) => setEditingMember({ ...editingMember, vacation_days_available: Number(e.target.value) })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingMember(null)}>Cancelar</Button>
            <Button
              onClick={() =>
                editingMember && saveMember.mutate({
                  id: editingMember.id,
                  contract_type: editingMember.contract_type ?? null,
                  salary_base: editingMember.salary_base ?? null,
                  hire_date: editingMember.hire_date || null,
                  vacation_days_available: editingMember.vacation_days_available ?? 0,
                  cedula: editingMember.cedula?.trim() || null,
                })
              }
              disabled={saveMember.isPending}
            >Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
