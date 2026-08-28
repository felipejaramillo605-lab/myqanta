import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calculator, Loader2 } from "lucide-react";

import { calculateSeverance, listHrMembers } from "@/lib/hr.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REASONS: Array<{ value: "resignation" | "mutual" | "without_cause" | "with_cause"; label: string }> = [
  { value: "resignation", label: "Renuncia" },
  { value: "mutual", label: "Mutuo acuerdo" },
  { value: "without_cause", label: "Despido sin justa causa" },
  { value: "with_cause", label: "Despido con justa causa" },
];

const money = (n: unknown) => Number(n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });

export function HrSeveranceCalculator() {
  const membersQ = useQuery({ queryKey: ["hr-members"], queryFn: () => listHrMembers() });
  const members = (membersQ.data ?? []) as Array<{ id: string; full_name: string; hire_date?: string | null }>;

  const [memberId, setMemberId] = useState("");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [vacationDays, setVacationDays] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"]>("resignation");
  const [result, setResult] = useState<any>(null);

  const calc = useMutation({
    mutationFn: () =>
      calculateSeverance({
        data: {
          member_id: memberId,
          end_date: endDate,
          reason,
          ...(vacationDays !== "" ? { pending_vacation_days: Number(vacationDays) } : {}),
        },
      }),
    onSuccess: (r) => setResult(r),
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  return (
    <div className="space-y-3">
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="min-w-52">
          <Label className="text-xs">Empleado</Label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Fecha de retiro</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Días de vacaciones pendientes</Label>
          <Input
            type="number"
            className="w-40"
            placeholder="Automático"
            value={vacationDays}
            onChange={(e) => setVacationDays(e.target.value)}
          />
        </div>
        <div className="min-w-48">
          <Label className="text-xs">Causa</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => calc.mutate()} disabled={!memberId || calc.isPending}>
          {calc.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Calculator className="mr-1 size-4" />}
          Calcular
        </Button>
      </div>

      {result && (
        <div className="glass space-y-3 rounded-2xl p-4">
          <p className="text-sm font-semibold">
            {result.member?.full_name} · {result.days_worked} días trabajados
          </p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ["Cesantías", result.cesantias],
              ["Intereses cesantías", result.intereses_cesantias],
              ["Prima", result.prima],
              ["Vacaciones", result.vacaciones],
              ["Indemnización", result.indemnizacion],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-border/40 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-mono text-sm font-semibold">{money(value)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Total a pagar</p>
            <p className="font-mono text-lg font-semibold">{money(result.total)}</p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {(result.notes ?? []).map((n: string) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
