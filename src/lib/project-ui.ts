import type { ProjectProfitability } from "./project-profitability";
import type { ProjectStatus, ProjectType } from "./projects.functions";

export type ProjectProfitRow = ProjectProfitability & {
  project: {
    id: string;
    name: string;
    status: ProjectStatus;
    project_type: ProjectType;
    platform: string | null;
    budget_amount: number | null;
    currency: string;
    client_name: string | null;
  };
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  video: "Video",
  design: "Diseño",
  social_media: "Redes sociales",
  campaign: "Campaña",
  other: "Otro",
};

export const PROJECT_TYPE_COLOR: Record<ProjectType, string> = {
  video: "bg-violet-500/15 text-violet-500 border-violet-500/30",
  design: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
  social_media: "bg-pink-500/15 text-pink-500 border-pink-500/30",
  campaign: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  other: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export type MarginState = "healthy" | "low" | "negative" | "unbilled";

/** Margin health: >15% verde, 0–15% amarillo, negativo rojo, sin facturar neutro. */
export function marginState(pct: number | null): MarginState {
  if (pct === null) return "unbilled";
  if (pct < 0) return "negative";
  if (pct <= 15) return "low";
  return "healthy";
}

export const MARGIN_STYLE: Record<MarginState, { className: string; label: string }> = {
  healthy: { className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", label: "Margen sano" },
  low: { className: "bg-amber-500/15 text-amber-500 border-amber-500/30", label: "Margen bajo" },
  negative: { className: "bg-rose-500/15 text-rose-500 border-rose-500/30", label: "Margen negativo" },
  unbilled: { className: "bg-secondary text-muted-foreground border-border/60", label: "Sin facturar" },
};

export function fmtMoney(n: number, currency = "EUR") {
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Horas objetivo aproximadas: presupuesto / tarifa media del proyecto.
 * La tarifa media se deriva del costo real de horas (hours_cost / hours);
 * si no hay tarifas registradas devuelve null y la UI muestra solo horas acumuladas.
 */
export function expectedHours(row: ProjectProfitRow): number | null {
  const budget = Number(row.project.budget_amount ?? 0);
  if (!budget || row.hours <= 0 || row.hours_cost <= 0) return null;
  const avgRate = row.hours_cost / row.hours;
  if (!Number.isFinite(avgRate) || avgRate <= 0) return null;
  return budget / avgRate;
}
