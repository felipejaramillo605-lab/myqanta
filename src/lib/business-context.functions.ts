import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";

export type BusinessContext = {
  id: string;
  name: string;
  industry: string | null;
  business_type: string | null;
  description: string | null;
  goals: string | null;
  team_size: string | null;
  currency: string | null;
  onboarded_at: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  contact_email: string | null;
  website: string | null;
  logo_url: string | null;
  invoice_prefix: string | null;
  invoice_footer: string | null;
  default_vat_rate: number | null;
};

export const getBusinessContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BusinessContext> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("organizations")
      .select("id,name,industry,business_type,description,goals,team_size,currency,onboarded_at,tax_id,address,phone,contact_email,website,logo_url,invoice_prefix,invoice_footer,default_vat_rate")
      .eq("id", orgId)
      .single();
    if (error) throw new Error(error.message);
    return data as BusinessContext;
  });

const updateSchema = z.object({
  industry: z.string().trim().min(1).max(80),
  business_type: z.string().trim().min(1).max(40),
  description: z.string().trim().max(600).optional().default(""),
  goals: z.string().trim().max(600).optional().default(""),
  team_size: z.string().trim().max(20).optional().default(""),
  currency: z.string().trim().min(1).max(8).default("USD"),
});

export const updateBusinessContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("organizations")
      .update({
        industry: data.industry,
        business_type: data.business_type,
        description: data.description || null,
        goals: data.goals || null,
        team_size: data.team_size || null,
        currency: data.currency,
        onboarded_at: new Date().toISOString(),
      })
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const companySchema = z.object({
  name: z.string().trim().min(1).max(120),
  tax_id: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  contact_email: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().max(200).optional().default(""),
  logo_url: z.string().trim().max(500).optional().default(""),
  invoice_prefix: z.string().trim().max(12).optional().default(""),
  invoice_footer: z.string().trim().max(600).optional().default(""),
  default_vat_rate: z.number().min(0).max(100).nullable().optional(),
  currency: z.string().trim().min(1).max(8).default("USD"),
});

export const updateCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companySchema.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("organizations")
      .update({
        name: data.name,
        tax_id: data.tax_id || null,
        address: data.address || null,
        phone: data.phone || null,
        contact_email: data.contact_email || null,
        website: data.website || null,
        logo_url: data.logo_url || null,
        invoice_prefix: data.invoice_prefix || null,
        invoice_footer: data.invoice_footer || null,
        default_vat_rate: data.default_vat_rate ?? null,
        currency: data.currency,
      })
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });