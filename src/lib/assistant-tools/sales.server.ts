import { z } from "zod";
import { tool } from "ai";
import { resolveOrgWithModuleAccess } from "../permissions";
import { ambiguous, audited, resolveOne, type AssistantToolCtx } from "./context.server";

export function salesTools(ctx: AssistantToolCtx) {
  const scope = (min: "member" | "admin") =>
    resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/sales", min);

  return {
    sales_create_invoice: tool({
      description:
        "Create a DRAFT sales invoice for a customer with one or more lines. The customer is matched by name, or created when it does not exist. Never issues the invoice: the user reviews and issues it from the Sales module.",
      inputSchema: z.object({
        customer_name: z.string().min(1).max(200),
        create_customer_if_missing: z.boolean().default(true),
        issue_date: z.string().optional().describe("ISO date YYYY-MM-DD; defaults to today."),
        due_date: z.string().optional().describe("ISO date YYYY-MM-DD"),
        notes: z.string().max(1000).optional(),
        items: z
          .array(
            z.object({
              description: z.string().min(1).max(300),
              quantity: z.number().positive().default(1),
              unit_price: z.number().min(0),
              tax_rate: z.number().min(0).max(100).default(0).describe("Percentage, e.g. 19 for 19% VAT."),
            }),
          )
          .min(1)
          .max(20),
      }),
      execute: async (input) => {
        const orgId = await scope("admin");
        return audited(ctx, "sales_create_invoice", input, orgId, async () => {
          const { data: cands } = await ctx.supabase
            .from("sales_customers")
            .select("id,name")
            .eq("org_id", orgId)
            .eq("archived", false)
            .ilike("name", `%${input.customer_name}%`)
            .limit(5);
          const m = resolveOne(cands, (c) => c.name);
          let customerId: string;
          let customerName: string;
          if (m.kind === "many") return { ok: false as const, error: ambiguous(input.customer_name, m.labels) };
          if (m.kind === "one") {
            customerId = m.row.id;
            customerName = m.row.name;
          } else {
            if (!input.create_customer_if_missing) {
              return { ok: false as const, error: `El cliente "${input.customer_name}" no existe.` };
            }
            const { data: created, error: cErr } = await ctx.supabase
              .from("sales_customers")
              .insert({ org_id: orgId, created_by: ctx.userId, name: input.customer_name })
              .select("id,name")
              .single();
            if (cErr || !created) return { ok: false as const, error: cErr?.message ?? "customer_insert_failed" };
            customerId = created.id;
            customerName = created.name;
          }

          let subtotal = 0;
          let taxAmount = 0;
          const lines = input.items.map((it, i) => {
            const lineSub = it.quantity * it.unit_price;
            subtotal += lineSub;
            taxAmount += (lineSub * it.tax_rate) / 100;
            return {
              org_id: orgId,
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              tax_rate: it.tax_rate,
              subtotal: lineSub,
              position: i,
            };
          });
          subtotal = Math.round(subtotal * 100) / 100;
          taxAmount = Math.round(taxAmount * 100) / 100;
          const total = Math.round((subtotal + taxAmount) * 100) / 100;

          const { data: inv, error } = await ctx.supabase
            .from("sales_invoices")
            .insert({
              org_id: orgId,
              created_by: ctx.userId,
              customer_id: customerId,
              customer_name_snapshot: customerName,
              issue_date: input.issue_date ?? new Date().toISOString().slice(0, 10),
              due_date: input.due_date ?? null,
              status: "draft",
              subtotal,
              tax_amount: taxAmount,
              total,
              notes: input.notes ?? null,
            })
            .select("id,status,subtotal,tax_amount,total,issue_date,due_date")
            .single();
          if (error || !inv) return { ok: false as const, error: error?.message ?? "invoice_insert_failed" };
          const { error: iErr } = await ctx.supabase
            .from("sales_invoice_items")
            .insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
          if (iErr) {
            await ctx.supabase.from("sales_invoices").delete().eq("id", inv.id).eq("org_id", orgId);
            return { ok: false as const, error: iErr.message };
          }
          return {
            ok: true as const,
            result: { invoice: inv, customer: customerName, lines: lines.length, status: "draft" },
          };
        });
      },
    }),

    sales_register_payment: tool({
      description:
        "Register a payment against an existing sales invoice, found by its invoice number or by customer name. Updates the paid amount and marks the invoice as paid when fully settled.",
      inputSchema: z.object({
        invoice_number: z.number().int().optional().describe("Invoice number as shown to the user."),
        customer_name: z.string().max(200).optional().describe("Used when no invoice number is given."),
        amount: z.number().positive(),
        paid_on: z.string().optional().describe("ISO date YYYY-MM-DD; defaults to today."),
        method: z.enum(["cash", "bank", "card", "other"]).default("bank"),
        notes: z.string().max(400).optional(),
      }),
      execute: async (input) => {
        const orgId = await scope("admin");
        return audited(ctx, "sales_register_payment", input, orgId, async () => {
          let query = ctx.supabase
            .from("sales_invoices")
            .select("id,number,customer_name_snapshot,total,paid_amount,status")
            .eq("org_id", orgId)
            .neq("status", "void");
          if (input.invoice_number !== undefined) query = query.eq("number", input.invoice_number);
          else if (input.customer_name) query = query.ilike("customer_name_snapshot", `%${input.customer_name}%`);
          else return { ok: false as const, error: "Indica el número de factura o el nombre del cliente." };
          const { data: cands } = await query.limit(5);
          const m = resolveOne(cands, (i) => `#${i.number ?? "-"} ${i.customer_name_snapshot ?? ""} (${i.total})`);
          if (m.kind === "none") return { ok: false as const, error: "No encontré esa factura." };
          if (m.kind === "many") {
            return { ok: false as const, error: ambiguous(input.customer_name ?? "la factura", m.labels) };
          }
          const inv = m.row;
          const { data: pay, error } = await ctx.supabase
            .from("sales_payments")
            .insert({
              org_id: orgId,
              created_by: ctx.userId,
              invoice_id: inv.id,
              amount: input.amount,
              paid_on: input.paid_on ?? new Date().toISOString().slice(0, 10),
              method: input.method,
              notes: input.notes ?? null,
            })
            .select("id,amount,paid_on,method")
            .single();
          if (error || !pay) return { ok: false as const, error: error?.message ?? "payment_insert_failed" };
          const newPaid = Math.round((Number(inv.paid_amount ?? 0) + input.amount) * 100) / 100;
          const fullyPaid = newPaid + 0.009 >= Number(inv.total);
          await ctx.supabase
            .from("sales_invoices")
            .update({ paid_amount: newPaid, ...(fullyPaid ? { status: "paid" } : {}) })
            .eq("id", inv.id)
            .eq("org_id", orgId);
          return {
            ok: true as const,
            result: {
              payment: pay,
              invoice_number: inv.number,
              customer: inv.customer_name_snapshot,
              paid_amount: newPaid,
              balance: Math.round((Number(inv.total) - newPaid) * 100) / 100,
              status: fullyPaid ? "paid" : inv.status,
            },
          };
        });
      },
    }),

    sales_overdue_summary: tool({
      description:
        "Read-only: outstanding receivables of the active organization — total pending, overdue invoices and aging buckets (0-30, 31-60, 61-90, 90+ days).",
      inputSchema: z.object({}),
      execute: async () => {
        const orgId = await scope("member");
        const { data } = await ctx.supabase
          .from("sales_invoices")
          .select("number,customer_name_snapshot,total,paid_amount,due_date,status")
          .eq("org_id", orgId)
          .not("status", "in", "(draft,void,paid)")
          .limit(300);
        const today = new Date();
        const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
        let pending = 0;
        const overdue: Array<Record<string, unknown>> = [];
        for (const inv of data ?? []) {
          const balance = Math.round((Number(inv.total) - Number(inv.paid_amount ?? 0)) * 100) / 100;
          if (balance <= 0) continue;
          pending += balance;
          if (!inv.due_date) continue;
          const days = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / 86_400_000);
          if (days <= 0) continue;
          overdue.push({ number: inv.number, customer: inv.customer_name_snapshot, balance, days_overdue: days });
          if (days <= 30) aging.d0_30 += balance;
          else if (days <= 60) aging.d31_60 += balance;
          else if (days <= 90) aging.d61_90 += balance;
          else aging.d90_plus += balance;
        }
        return {
          ok: true,
          total_pending: Math.round(pending * 100) / 100,
          overdue_count: overdue.length,
          aging,
          overdue: overdue.sort((a, b) => Number(b.days_overdue) - Number(a.days_overdue)).slice(0, 15),
        };
      },
    }),
  };
}
