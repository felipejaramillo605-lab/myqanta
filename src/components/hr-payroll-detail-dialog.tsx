import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { listPayrollItems } from "@/lib/hr.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  runId: string | null;
  period: string;
  onClose: () => void;
};

const money = (n: unknown) => Number(n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });

export function HrPayrollDetailDialog({ runId, period, onClose }: Props) {
  const q = useQuery({
    queryKey: ["hr-payroll-items", runId],
    queryFn: () => listPayrollItems({ data: { run_id: runId! } }),
    enabled: !!runId,
  });

  const rows = (q.data ?? []) as Array<Record<string, number | string>>;
  const total = (key: string) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

  return (
    <Dialog open={!!runId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(96vw,1100px)]">
        <DialogHeader>
          <DialogTitle>Detalle de nómina {period}</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin detalle para este periodo.</p>
        ) : (
          <div className="max-h-[65vh] overflow-auto rounded-xl border border-border/40">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50 text-left uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Empleado</th>
                  <th className="px-2 py-2">Días</th>
                  <th className="px-2 py-2 text-right">Salario</th>
                  <th className="px-2 py-2 text-right">Transporte</th>
                  <th className="px-2 py-2 text-right">Devengado</th>
                  <th className="px-2 py-2 text-right">Salud</th>
                  <th className="px-2 py-2 text-right">Pensión</th>
                  <th className="px-2 py-2 text-right">Solidaridad</th>
                  <th className="px-2 py-2 text-right">Otras</th>
                  <th className="px-2 py-2 text-right">Neto</th>
                  <th className="px-2 py-2 text-right">Aportes patronales</th>
                  <th className="px-2 py-2 text-right">Provisiones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)} className="border-t border-border/40">
                    <td className="px-2 py-1.5">{String(r.full_name)}</td>
                    <td className="px-2 py-1.5">{String(r.worked_days)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.base_salary)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.transport_allowance)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.gross)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.health_employee)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.pension_employee)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.solidarity_fund)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.other_deductions)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{money(r.net)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.total_employer)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{money(r.total_provisions)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="px-2 py-2">Totales</td>
                  <td />
                  <td className="px-2 py-2 text-right font-mono">{money(total("base_salary"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("transport_allowance"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("gross"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("health_employee"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("pension_employee"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("solidarity_fund"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("other_deductions"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("net"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("total_employer"))}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(total("total_provisions"))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Cálculo estimado con los parámetros de la empresa. Valídalo con tu contador antes de pagar.
        </p>
      </DialogContent>
    </Dialog>
  );
}
