import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { getPayrollSettings, savePayrollSettings } from "@/lib/hr.functions";
import { listAccountsCoa } from "@/lib/finance-ext.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = { open: boolean; onClose: () => void };

const RATE_FIELDS: Array<{ key: string; label: string; pct: boolean }> = [
  { key: "health_employee_rate", label: "Salud empleado", pct: true },
  { key: "pension_employee_rate", label: "Pensión empleado", pct: true },
  { key: "solidarity_rate", label: "Fondo de solidaridad", pct: true },
  { key: "health_employer_rate", label: "Salud empleador", pct: true },
  { key: "pension_employer_rate", label: "Pensión empleador", pct: true },
  { key: "arl_rate", label: "ARL", pct: true },
  { key: "caja_rate", label: "Caja de compensación", pct: true },
  { key: "sena_rate", label: "SENA", pct: true },
  { key: "icbf_rate", label: "ICBF", pct: true },
  { key: "cesantias_rate", label: "Cesantías", pct: true },
  { key: "intereses_cesantias_rate", label: "Intereses cesantías", pct: true },
  { key: "prima_rate", label: "Prima", pct: true },
  { key: "vacaciones_rate", label: "Vacaciones", pct: true },
];

const ACCOUNT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "salary_expense_account_id", label: "Gasto de salarios" },
  { key: "employer_expense_account_id", label: "Gasto aportes patronales" },
  { key: "provisions_expense_account_id", label: "Gasto provisiones" },
  { key: "payroll_payable_account_id", label: "Nómina por pagar" },
  { key: "withholdings_payable_account_id", label: "Deducciones/aportes por pagar" },
  { key: "provisions_payable_account_id", label: "Provisiones por pagar" },
];

export function HrPayrollSettingsDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const settingsQ = useQuery({ queryKey: ["hr-payroll-settings"], queryFn: () => getPayrollSettings(), enabled: open });
  const accountsQ = useQuery({ queryKey: ["coa"], queryFn: () => listAccountsCoa(), enabled: open });
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (settingsQ.data) setForm({ ...(settingsQ.data as Record<string, any>) });
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = {
        minimum_wage: Number(form.minimum_wage) || 0,
        transport_allowance: Number(form.transport_allowance) || 0,
        transport_allowance_max_smmlv: Number(form.transport_allowance_max_smmlv) || 0,
        solidarity_threshold_smmlv: Number(form.solidarity_threshold_smmlv) || 0,
        notes: form.notes ?? null,
      };
      for (const f of RATE_FIELDS) payload[f.key] = Number(form[f.key]) || 0;
      for (const f of ACCOUNT_FIELDS) payload[f.key] = form[f.key] || null;
      return savePayrollSettings({ data: payload as never });
    },
    onSuccess: () => {
      toast.success("Parámetros de nómina guardados");
      qc.invalidateQueries({ queryKey: ["hr-payroll-settings"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const accounts = (accountsQ.data ?? []) as Array<{ id: string; code: string; name: string }>;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(96vw,860px)]">
        <DialogHeader>
          <DialogTitle>Parámetros de nómina</DialogTitle>
        </DialogHeader>

        {settingsQ.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[65vh] space-y-5 overflow-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Salario mínimo</Label>
                <Input
                  type="number"
                  value={form.minimum_wage ?? 0}
                  onChange={(e) => setForm({ ...form, minimum_wage: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Auxilio de transporte</Label>
                <Input
                  type="number"
                  value={form.transport_allowance ?? 0}
                  onChange={(e) => setForm({ ...form, transport_allowance: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Tope auxilio (SMMLV)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.transport_allowance_max_smmlv ?? 2}
                  onChange={(e) => setForm({ ...form, transport_allowance_max_smmlv: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Umbral solidaridad (SMMLV)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.solidarity_threshold_smmlv ?? 4}
                  onChange={(e) => setForm({ ...form, solidarity_threshold_smmlv: e.target.value })}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Tasas (en decimal, 0.04 = 4%)</p>
              <div className="grid gap-3 sm:grid-cols-4">
                {RATE_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={form[f.key] ?? 0}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Cuentas contables (opcional)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {ACCOUNT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs">{f.label}</Label>
                    <Select
                      value={form[f.key] ?? ""}
                      onValueChange={(v) => setForm({ ...form, [f.key]: v === "__none" ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sin cuenta</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Los valores por defecto siguen la normativa colombiana vigente al momento de la implementación. Revísalos
              cada año con tu contador antes de usarlos para pagos reales.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
