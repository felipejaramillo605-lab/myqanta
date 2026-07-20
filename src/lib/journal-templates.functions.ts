import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole } from "./permissions";

export type TemplateLine = {
  id?: string;
  step: "accrual" | "payment";
  account_code: string | null;
  account_name: string;
  side: "debit" | "credit";
  amount_formula: string;
  order_index: number;
};

export type JournalTemplate = {
  id: string;
  org_id: string | null;
  name: string;
  niif_category: string;
  is_predefined: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  lines: TemplateLine[];
};

const LineInput = z.object({
  step: z.enum(["accrual", "payment"]),
  account_code: z.string().trim().max(20).nullable().optional(),
  account_name: z.string().trim().min(1).max(160),
  side: z.enum(["debit", "credit"]),
  amount_formula: z.string().trim().min(1).max(80).default("total"),
  order_index: z.number().int().min(0).max(50).default(0),
});

const TemplateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  niif_category: z.string().trim().min(1).max(120),
  is_active: z.boolean().default(true),
  lines: z.array(LineInput).min(2).max(30),
});

export const listJournalTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JournalTemplate[]> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    // RLS returns predefined + this org.
    const { data: templates, error } = await context.supabase
      .from("journal_templates" as never)
      .select("*")
      .or(`is_predefined.eq.true,org_id.eq.${orgId}`)
      .order("is_predefined", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    const ids = (templates ?? []).map((t: any) => t.id);
    let linesByTpl = new Map<string, TemplateLine[]>();
    if (ids.length) {
      const { data: lines, error: lErr } = await context.supabase
        .from("journal_template_lines" as never)
        .select("*")
        .in("template_id", ids)
        .order("step")
        .order("order_index");
      if (lErr) throw new Error(lErr.message);
      for (const l of (lines ?? []) as any[]) {
        const arr = linesByTpl.get(l.template_id) ?? [];
        arr.push({
          id: l.id,
          step: l.step,
          account_code: l.account_code,
          account_name: l.account_name,
          side: l.side,
          amount_formula: l.amount_formula,
          order_index: l.order_index,
        });
        linesByTpl.set(l.template_id, arr);
      }
    }
    return ((templates ?? []) as any[]).map((t) => ({
      ...t,
      lines: linesByTpl.get(t.id) ?? [],
    })) as JournalTemplate[];
  });

export const upsertJournalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TemplateInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    // Guard: editing existing must belong to this org and not be predefined.
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("journal_templates" as never)
        .select("org_id,is_predefined")
        .eq("id", data.id)
        .maybeSingle();
      if (!existing) throw new Error("Plantilla no encontrada");
      const e: any = existing;
      if (e.is_predefined) throw new Error("Las plantillas predefinidas no se pueden editar. Puedes desactivarlas o crear una copia.");
      if (e.org_id !== orgId) throw new Error("Forbidden");
    }
    let templateId = data.id;
    if (!templateId) {
      const { data: ins, error } = await context.supabase
        .from("journal_templates" as never)
        .insert({
          org_id: orgId,
          name: data.name,
          niif_category: data.niif_category,
          is_active: data.is_active,
          is_predefined: false,
          created_by: context.userId,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      templateId = (ins as any).id;
    } else {
      const { error } = await context.supabase
        .from("journal_templates" as never)
        .update({
          name: data.name,
          niif_category: data.niif_category,
          is_active: data.is_active,
        } as never)
        .eq("id", templateId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
      await context.supabase
        .from("journal_template_lines" as never)
        .delete()
        .eq("template_id", templateId);
    }
    const rows = data.lines.map((l, i) => ({
      template_id: templateId,
      step: l.step,
      account_code: l.account_code ?? null,
      account_name: l.account_name,
      side: l.side,
      amount_formula: l.amount_formula || "total",
      order_index: l.order_index ?? i,
    }));
    const { error: lErr } = await context.supabase
      .from("journal_template_lines" as never)
      .insert(rows as never);
    if (lErr) throw new Error(lErr.message);
    return { id: templateId };
  });

export const deleteJournalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data: existing } = await context.supabase
      .from("journal_templates" as never)
      .select("org_id,is_predefined")
      .eq("id", data.id)
      .maybeSingle();
    const e: any = existing;
    if (!e) throw new Error("Plantilla no encontrada");
    if (e.is_predefined) throw new Error("No se puede borrar una plantilla predefinida (usa Desactivar).");
    if (e.org_id !== orgId) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("journal_templates" as never)
      .delete()
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Toggle is_active. For predefined templates we store an org-level override
// via a copy? Simpler: only allow toggling org-owned templates. Predefined
// stays active globally.
export const toggleJournalTemplateActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data: existing } = await context.supabase
      .from("journal_templates" as never)
      .select("org_id,is_predefined")
      .eq("id", data.id)
      .maybeSingle();
    const e: any = existing;
    if (!e) throw new Error("Plantilla no encontrada");
    if (e.is_predefined) throw new Error("Para desactivar una predefinida, crea una copia en tu organización.");
    if (e.org_id !== orgId) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("journal_templates" as never)
      .update({ is_active: data.is_active } as never)
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });