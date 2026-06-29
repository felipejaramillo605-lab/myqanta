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
};

export const getBusinessContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BusinessContext> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("organizations")
      .select("id,name,industry,business_type,description,goals,team_size,currency,onboarded_at")
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