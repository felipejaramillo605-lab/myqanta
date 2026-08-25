import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import type { ProjectProfitRow } from "@/lib/project-ui";

const COLOR_REVENUE = "#22d3ee";
const COLOR_COST = "#f87171";
const COLOR_MARGIN_POS = "#34d399";
const COLOR_MARGIN_NEG = "#f87171";

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toFixed(0);
}

const TOOLTIP = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
} as const;

/** Costo vs. ingreso facturado por proyecto (mismo estilo que los charts de EBITDA). */
export function ProjectMarginChart({ rows }: { rows: ProjectProfitRow[] }) {
  const data = rows
    .map((r) => ({
      name: r.project.name.length > 16 ? r.project.name.slice(0, 15) + "…" : r.project.name,
      costo: r.cost_total,
      ingreso: r.invoiced_total,
      margen: r.margin,
    }))
    .filter((d) => d.costo || d.ingreso)
    .sort((a, b) => b.margen - a.margen)
    .slice(0, 10);

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" />
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Costo vs. ingreso por proyecto
        </h2>
      </div>
      {data.length === 0 ? (
        <div className="mt-6 grid h-56 place-items-center rounded-xl bg-muted/30 text-xs text-muted-foreground">
          Sin datos de costo ni facturación todavía.
        </div>
      ) : (
        <>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => v.toFixed(2)} />
                <Bar dataKey="ingreso" name="Ingreso" fill={COLOR_REVENUE} radius={[6, 6, 0, 0]} />
                <Bar dataKey="costo" name="Costo" fill={COLOR_COST} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Dot color={COLOR_REVENUE} label="Ingreso facturado" />
            <Dot color={COLOR_COST} label="Costo (horas + gastos)" />
          </div>
        </>
      )}
    </section>
  );
}

/** Desglose de un único proyecto: costo de horas, gastos, facturado y margen. */
export function ProjectBreakdownChart({ row }: { row: ProjectProfitRow }) {
  const data = [
    { name: "Costo horas", value: row.hours_cost, color: COLOR_COST },
    { name: "Gastos", color: "#fbbf24", value: row.expenses },
    { name: "Facturado", value: row.invoiced_total, color: COLOR_REVENUE },
    { name: "Margen", value: row.margin, color: row.margin >= 0 ? COLOR_MARGIN_POS : COLOR_MARGIN_NEG },
  ];
  const hasData = data.some((d) => Math.abs(d.value) > 0.001);

  if (!hasData) {
    return (
      <div className="grid h-48 place-items-center rounded-xl bg-muted/30 text-xs text-muted-foreground">
        Aún no hay horas, gastos ni facturas en este proyecto.
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={TOOLTIP} formatter={(v: number) => v.toFixed(2)} />
          <Bar dataKey="value" name="Importe" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
