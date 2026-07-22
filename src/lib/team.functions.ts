import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";

const CodeRe = /^[A-Za-z0-9_-]{2,32}$/;

const MemberInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().regex(CodeRe, "Código: 2-32 caracteres alfanuméricos, _ o -"),
  full_name: z.string().trim().min(1).max(120),
  position: z.string().trim().max(120).nullable().optional(),
  phone_e164: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  archived: z.boolean().optional(),
});

export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/team", "member");
    const { data, error } = await context.supabase
      .from("team_members")
      .select("*")
      .eq("org_id", orgId)
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MemberInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/team", "member");
    if (data.id) {
      const { data: existing, error: exErr } = await context.supabase
        .from("team_members")
        .select("org_id")
        .eq("id", data.id)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (existing && existing.org_id !== orgId) throw new Error("Forbidden");
    }
    const payload = {
      ...data,
      org_id: orgId,
      created_by: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("team_members")
      .upsert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/team", "member");
    const { error } = await context.supabase
      .from("team_members")
      .delete()
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
