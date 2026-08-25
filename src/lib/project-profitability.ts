export type ProfitTimeEntry = { project_id: string; user_id: string; hours: number | string };
export type ProfitMemberRate = { project_id: string; user_id: string; hourly_rate: number | string | null };
export type ProfitExpense = { project_id: string; amount: number | string | null };
export type ProfitInvoice = {
  project_id: string | null;
  total: number | string | null;
  paid_amount: number | string | null;
};

export type ProjectProfitability = {
  project_id: string;
  hours: number;
  hours_cost: number;
  expenses: number;
  invoiced_total: number;
  invoiced_paid: number;
  cost_total: number;
  margin: number;
  margin_pct: number | null;
};

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pure in-memory rollup of project profitability.
 * Margin = invoiced total − (hours cost + direct expenses).
 * Members without an hourly_rate contribute 0 cost for their hours.
 */
export function computeProjectProfitability(input: {
  projectIds: string[];
  timeEntries: ProfitTimeEntry[];
  memberRates: ProfitMemberRate[];
  expenses: ProfitExpense[];
  invoices: ProfitInvoice[];
}): ProjectProfitability[] {
  const rate = new Map<string, number>();
  for (const m of input.memberRates) rate.set(`${m.project_id}:${m.user_id}`, num(m.hourly_rate));

  const acc = new Map<string, ProjectProfitability>();
  const get = (id: string) => {
    let cur = acc.get(id);
    if (!cur) {
      cur = {
        project_id: id,
        hours: 0,
        hours_cost: 0,
        expenses: 0,
        invoiced_total: 0,
        invoiced_paid: 0,
        cost_total: 0,
        margin: 0,
        margin_pct: null,
      };
      acc.set(id, cur);
    }
    return cur;
  };

  for (const id of input.projectIds) get(id);

  for (const t of input.timeEntries) {
    const row = get(t.project_id);
    const h = num(t.hours);
    row.hours += h;
    row.hours_cost += h * (rate.get(`${t.project_id}:${t.user_id}`) ?? 0);
  }

  for (const e of input.expenses) get(e.project_id).expenses += num(e.amount);

  for (const inv of input.invoices) {
    if (!inv.project_id) continue;
    const row = get(inv.project_id);
    row.invoiced_total += num(inv.total);
    row.invoiced_paid += num(inv.paid_amount);
  }

  return Array.from(acc.values()).map((r) => {
    const cost_total = round2(r.hours_cost + r.expenses);
    const invoiced_total = round2(r.invoiced_total);
    const margin = round2(invoiced_total - cost_total);
    return {
      ...r,
      hours: round2(r.hours),
      hours_cost: round2(r.hours_cost),
      expenses: round2(r.expenses),
      invoiced_total,
      invoiced_paid: round2(r.invoiced_paid),
      cost_total,
      margin,
      margin_pct: invoiced_total > 0 ? round2((margin / invoiced_total) * 100) : null,
    };
  });
}
