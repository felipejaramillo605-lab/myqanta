// Shared helpers for reminder recurrence rules.
// Kept framework-agnostic so both the server function and the cron
// route can reuse the same "next occurrence" logic.

export type Recurrence = "none" | "daily" | "weekly" | "monthly";

/**
 * Compute the next scheduled_at from a previous run.
 * Rules:
 *  - daily   → +interval días
 *  - weekly  → +interval semanas (mismo día de la semana)
 *  - monthly → +interval meses (mismo día del mes; se ajusta si el mes destino es más corto)
 *  - none    → null (no repetir)
 * Returns null when recurrence is "none", interval is invalid, or the next
 * date would exceed `until` (inclusive).
 */
export function computeNextOccurrence(
  previous: Date | string,
  recurrence: Recurrence,
  interval = 1,
  until: Date | string | null = null,
): Date | null {
  if (recurrence === "none") return null;
  const step = Math.max(1, Math.floor(interval || 1));
  const base = new Date(previous);
  if (Number.isNaN(base.getTime())) return null;

  const next = new Date(base);
  if (recurrence === "daily") {
    next.setUTCDate(next.getUTCDate() + step);
  } else if (recurrence === "weekly") {
    next.setUTCDate(next.getUTCDate() + step * 7);
  } else if (recurrence === "monthly") {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + step);
    // Ajuste si el mes destino tiene menos días (p.ej. 31 ene → 28/29 feb)
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }

  if (until) {
    const limit = new Date(until);
    if (!Number.isNaN(limit.getTime()) && next.getTime() > limit.getTime()) return null;
  }
  return next;
}

export function describeRecurrence(rec: Recurrence, interval = 1): string {
  if (rec === "none") return "Una vez";
  const n = Math.max(1, interval);
  if (rec === "daily") return n === 1 ? "Cada día" : `Cada ${n} días`;
  if (rec === "weekly") return n === 1 ? "Cada semana" : `Cada ${n} semanas`;
  return n === 1 ? "Cada mes" : `Cada ${n} meses`;
}