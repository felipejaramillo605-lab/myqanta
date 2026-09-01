import { describe, expect, it } from "vitest";
import {
  aggregatePnl,
  bucketForAccount,
  pnlTotals,
  signedBalance,
  type PostedLine,
} from "../accounting-core";

const line = (
  code: string,
  type: "asset" | "liability" | "equity" | "income" | "expense",
  debit: number,
  credit: number,
): PostedLine => ({
  id: `${code}-${debit}-${credit}`,
  entry_id: "e1",
  entry_no: 1,
  entry_date: "2026-01-15",
  account_id: code,
  account: { id: code, code, name: code, type, is_current: null, parent_id: null },
  third_party_id: null,
  cost_center_id: null,
  description: null,
  debit,
  credit,
});

describe("signedBalance", () => {
  it("uses debit-credit for assets and expenses", () => {
    expect(signedBalance("asset", 100, 30)).toBe(70);
    expect(signedBalance("expense", 100, 0)).toBe(100);
  });
  it("uses credit-debit for liability, equity and income", () => {
    expect(signedBalance("liability", 30, 100)).toBe(70);
    expect(signedBalance("equity", 0, 500)).toBe(500);
    expect(signedBalance("income", 0, 250)).toBe(250);
  });
});

describe("bucketForAccount", () => {
  it("maps PUC codes to EBITDA buckets", () => {
    expect(bucketForAccount({ type: "income", code: "4135" })).toBe("revenue");
    expect(bucketForAccount({ type: "income", code: "4210" })).toBe("other_income");
    expect(bucketForAccount({ type: "expense", code: "6135" })).toBe("cogs");
    expect(bucketForAccount({ type: "expense", code: "5135" })).toBe("opex");
    expect(bucketForAccount({ type: "expense", code: "5160" })).toBe("depreciation");
    expect(bucketForAccount({ type: "expense", code: "5165" })).toBe("amortization");
    expect(bucketForAccount({ type: "expense", code: "5305" })).toBe("interest");
    expect(bucketForAccount({ type: "expense", code: "5115" })).toBe("tax");
  });
  it("ignores balance-sheet accounts", () => {
    expect(bucketForAccount({ type: "asset", code: "1110" })).toBeNull();
    expect(bucketForAccount({ type: "equity", code: "3115" })).toBeNull();
  });
});

describe("aggregatePnl + pnlTotals", () => {
  it("computes revenue, costs, ebitda and net from posted lines", () => {
    const lines = [
      line("4135", "income", 0, 1000),
      line("6135", "expense", 400, 0),
      line("5135", "expense", 200, 0),
      line("5160", "expense", 50, 0),
      line("5305", "expense", 30, 0),
      line("4210", "income", 0, 20),
      line("1110", "asset", 1000, 0), // ignored by the P&L
    ];
    const t = pnlTotals(aggregatePnl(lines));
    expect(t.revenue).toBe(1000);
    expect(t.cogs).toBe(400);
    expect(t.opex).toBe(200);
    expect(t.costs).toBe(600);
    expect(t.ebitda).toBe(400);
    expect(t.net).toBe(400 - 50 - 30 + 20);
    expect(t.margin).toBeCloseTo(40);
  });

  it("nets credit notes against revenue", () => {
    const t = pnlTotals(aggregatePnl([line("4135", "income", 0, 1000), line("4135", "income", 100, 0)]));
    expect(t.revenue).toBe(900);
  });
});
