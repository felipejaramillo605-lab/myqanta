import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, CheckSquare, Handshake, Package, Wallet } from "lucide-react";
import { getActionCenter } from "@/lib/insights.functions";

function money(n: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

function Card({
  to,
  icon,
  label,
  value,
  hint,
  alert,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  alert?: boolean;
}) {
  return (
    <Link
      to={to}
      className={
        "glass group flex flex-col gap-2 rounded-2xl p-4 transition hover:shadow-lg " +
        (alert ? "ring-1 ring-destructive/40" : "")
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <span className={alert ? "text-destructive" : "text-primary"}>{icon}</span>
          {label}
        </div>
        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      </div>
      <div className={"font-mono text-2xl font-semibold tracking-tight " + (alert ? "text-destructive" : "")}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </Link>
  );
}

/** Cross-module action center: each card links to the module that resolves it. */
export function ActionCenter() {
  const fn = useServerFn(getActionCenter);
  const { data } = useSuspenseQuery({ queryKey: ["insights", "action-center"], queryFn: () => fn() });

  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Qué necesita atención</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card
          to="/sales"
          icon={<Wallet className="size-4" />}
          label="Cartera vencida"
          value={money(data.receivables.overdue)}
          hint={`${data.receivables.overdue_count} facturas vencidas · ${money(data.receivables.pending)} por cobrar`}
          alert={data.receivables.overdue > 0}
        />
        <Card
          to="/crm"
          icon={<Handshake className="size-4" />}
          label="Cierres del mes"
          value={String(data.deals.closing_this_month)}
          hint={`${money(data.deals.amount)} en juego · ${data.deals.stale} sin actividad 14d`}
        />
        <Card
          to="/inventory"
          icon={<Package className="size-4" />}
          label="Stock crítico"
          value={String(data.inventory.low_stock)}
          hint={`Inventario valorizado en ${money(data.inventory.stock_value)}`}
          alert={data.inventory.low_stock > 0}
        />
        <Card
          to="/approvals"
          icon={<CheckSquare className="size-4" />}
          label="Aprobaciones"
          value={String(data.approvals.pending)}
          hint="Solicitudes pendientes de decisión"
          alert={data.approvals.pending > 0}
        />
        <Card
          to="/agenda"
          icon={<AlertTriangle className="size-4" />}
          label="Tareas vencidas"
          value={String(data.tasks.overdue)}
          hint="Tareas abiertas con fecha pasada"
          alert={data.tasks.overdue > 0}
        />
      </div>
    </section>
  );
}
