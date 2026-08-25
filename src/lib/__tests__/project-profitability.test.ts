import { describe, expect, it } from "vitest";
import { computeProjectProfitability } from "@/lib/project-profitability";

const P1 = "11111111-1111-1111-1111-111111111111";
const U1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("computeProjectProfitability", () => {
  it("margin equals invoiced revenue when there are no hours nor expenses", () => {
    const [row] = computeProjectProfitability({
      projectIds: [P1],
      timeEntries: [],
      memberRates: [],
      expenses: [],
      invoices: [{ project_id: P1, total: 1000, paid_amount: 400 }],
    });
    expect(row.cost_total).toBe(0);
    expect(row.invoiced_total).toBe(1000);
    expect(row.invoiced_paid).toBe(400);
    expect(row.margin).toBe(1000);
    expect(row.margin_pct).toBe(100);
  });

  it("reports a negative margin when cost exceeds revenue", () => {
    const [row] = computeProjectProfitability({
      projectIds: [P1],
      timeEntries: [{ project_id: P1, user_id: U1, hours: 10 }],
      memberRates: [{ project_id: P1, user_id: U1, hourly_rate: 50 }],
      expenses: [{ project_id: P1, amount: 200 }],
      invoices: [{ project_id: P1, total: 500, paid_amount: 0 }],
    });
    expect(row.hours_cost).toBe(500);
    expect(row.expenses).toBe(200);
    expect(row.cost_total).toBe(700);
    expect(row.margin).toBe(-200);
    expect(row.margin_pct).toBe(-40);
  });

  it("costs 0 for hours of members without hourly_rate", () => {
    const [row] = computeProjectProfitability({
      projectIds: [P1],
      timeEntries: [{ project_id: P1, user_id: U1, hours: "8" }],
      memberRates: [{ project_id: P1, user_id: U1, hourly_rate: null }],
      expenses: [],
      invoices: [{ project_id: P1, total: 300, paid_amount: 300 }],
    });
    expect(row.hours).toBe(8);
    expect(row.hours_cost).toBe(0);
    expect(row.margin).toBe(300);
  });

  it("returns null margin_pct when nothing has been invoiced", () => {
    const [row] = computeProjectProfitability({
      projectIds: [P1],
      timeEntries: [],
      memberRates: [],
      expenses: [{ project_id: P1, amount: 120 }],
      invoices: [],
    });
    expect(row.margin).toBe(-120);
    expect(row.margin_pct).toBeNull();
  });
});
