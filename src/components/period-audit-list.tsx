import { History, Lock, LockOpen, Archive, Undo2, Landmark } from "lucide-react";
import type { PeriodAuditRow } from "@/lib/finance-periods.functions";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const ACTIONS: Record<string, { label: string; Icon: typeof Lock; tone: string }> = {
  period_closed: { label: "Periodo cerrado", Icon: Lock, tone: "text-primary" },
  period_reopened: { label: "Periodo reabierto", Icon: LockOpen, tone: "text-destructive" },
  year_end_closed: { label: "Cierre anual generado", Icon: Archive, tone: "text-primary" },
  year_end_reverted: { label: "Cierre anual anulado", Icon: Undo2, tone: "text-destructive" },
  bank_reconciliation_closed: { label: "Conciliación bancaria cerrada", Icon: Landmark, tone: "text-primary" },
  bank_reconciliation_reopened: { label: "Conciliación bancaria reabierta", Icon: Landmark, tone: "text-destructive" },
};

/** Línea de tiempo de cierres y reaperturas, con quién, cuándo y por qué. */
export function PeriodAuditList({
  rows,
  loading,
  title = "Historial de cierres y reaperturas",
  emptyText = "Todavía no hay cierres ni reaperturas registrados.",
}: {
  rows: PeriodAuditRow[];
  loading?: boolean;
  title?: string;
  emptyText?: string;
}) {
  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 font-medium">
        <History className="size-4" /> {title}
      </div>
      {loading && <div className="text-sm text-muted-foreground">Cargando…</div>}
      {!loading && !rows.length && <div className="text-sm text-muted-foreground">{emptyText}</div>}
      <ol className="space-y-3">
        {rows.map((r) => {
          const meta = ACTIONS[r.action] ?? { label: r.action, Icon: History, tone: "" };
          const Icon = meta.Icon;
          return (
            <li key={r.id} className="flex items-start gap-3 text-sm">
              <Icon className={`size-4 mt-0.5 shrink-0 ${meta.tone}`} />
              <div className="space-y-0.5">
                <div className="font-medium">
                  {meta.label}
                  <span className="text-muted-foreground font-normal">
                    {" · "}
                    {r.month ? `${MONTHS[r.month - 1]} ${r.year}` : r.year}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.actor_name || "Usuario"} · {new Date(r.created_at).toLocaleString("es-CO")}
                </div>
                {r.reason && <div className="text-xs">{r.reason}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
