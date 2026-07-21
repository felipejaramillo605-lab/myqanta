import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgWithRole, assertOrgRole } from "./permissions";
import { MODULE_KEYS } from "./module-registry";
import { z } from "zod";

const ModuleKey = z.enum(MODULE_KEYS as [string, ...string[]]);

export const listCustomRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data, error } = await context.supabase
      .from("custom_roles")
      .select("id, name, description, allowed_modules, created_at, updated_at")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return { orgId, roles: data ?? [] };
  });

export const upsertCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(300).optional().nullable(),
      allowed_modules: z.array(ModuleKey).default([]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const payload = {
      org_id: orgId,
      name: data.name,
      description: data.description ?? null,
      allowed_modules: data.allowed_modules,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: existing, error: checkErr } = await context.supabase
        .from("custom_roles")
        .select("org_id")
        .eq("id", data.id)
        .maybeSingle();
      if (checkErr) throw new Error(checkErr.message);
      if (!existing || existing.org_id !== orgId) throw new Error("Forbidden");
      const { data: out, error } = await context.supabase
        .from("custom_roles")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("org_id", orgId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return out;
    }
    const { data: out, error } = await context.supabase
      .from("custom_roles")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    await context.supabase
      .from("organization_members")
      .update({ custom_role_id: null })
      .eq("org_id", orgId)
      .eq("custom_role_id", data.id);
    const { error } = await context.supabase
      .from("custom_roles")
      .delete()
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMembersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { data: members, error } = await context.supabase
      .from("organization_members")
      .select("user_id, role, custom_role_id, created_at")
      .eq("org_id", orgId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const ids = (members ?? []).map((m) => m.user_id);
    let profilesById = new Map<string, { full_name: string | null }>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      profilesById = new Map(
        (profs ?? []).map((p) => [p.id, { full_name: p.full_name }]),
      );
    }
    const enriched = (members ?? []).map((m) => ({
      ...m,
      full_name: profilesById.get(m.user_id)?.full_name ?? null,
    }));
    return { orgId, members: enriched };
  });

export const assignCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      custom_role_id: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    await assertOrgRole(context.supabase, context.userId, orgId, "admin");
    if (data.custom_role_id) {
      const { data: role, error: roleErr } = await context.supabase
        .from("custom_roles")
        .select("org_id")
        .eq("id", data.custom_role_id)
        .maybeSingle();
      if (roleErr) throw new Error(roleErr.message);
      if (!role || role.org_id !== orgId)
        throw new Error("Forbidden: el rol no pertenece a esta organización");
    }
    const { data: target, error: targetErr } = await context.supabase
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (targetErr) throw new Error(targetErr.message);
    if (!target) throw new Error("Miembro no encontrado en esta organización");
    if (target.role === "owner")
      throw new Error("El rol de owner no se puede restringir por módulos");
    const { error } = await context.supabase
      .from("organization_members")
      .update({ custom_role_id: data.custom_role_id })
      .eq("org_id", orgId)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });