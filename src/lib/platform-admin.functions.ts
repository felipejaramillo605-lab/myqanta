import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertPlatformOwner } from "./platform-security.functions";

export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase.rpc as any)("platform_list_users");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      email: string;
      created_at: string;
      last_sign_in_at: string | null;
      full_name: string | null;
      is_blocked: boolean;
      blocked_at: string | null;
      blocked_reason: string | null;
      org_count: number;
    }>;
  });

export const listPlatformOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { data: orgs, error } = await context.supabase
      .from("organizations")
      .select("id,name,slug,created_at,created_by,industry,business_type")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (orgs ?? []).map((o) => o.id);
    let counts = new Map<string, number>();
    if (ids.length) {
      const { data: mems } = await context.supabase
        .from("organization_members")
        .select("org_id")
        .in("org_id", ids);
      for (const m of mems ?? []) counts.set(m.org_id, (counts.get(m.org_id) ?? 0) + 1);
    }
    return (orgs ?? []).map((o) => ({ ...o, member_count: counts.get(o.id) ?? 0 }));
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      blocked: z.boolean(),
      reason: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase.rpc as any)("platform_set_blocked", {
      _user_id: data.user_id,
      _blocked: data.blocked,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const amIBlocked = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase.rpc as any)("am_i_blocked");
    if (error) return false;
    return Boolean(data);
  });

export const listOrgMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members, error } = await supabaseAdmin
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (members ?? []).map((m) => m.user_id);
    let profByUser = new Map<string, { full_name: string | null; is_blocked: boolean }>();
    let emailByUser = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, is_blocked")
        .in("id", ids);
      for (const p of profs ?? []) {
        profByUser.set(p.id, { full_name: p.full_name, is_blocked: Boolean((p as any).is_blocked) });
      }
      const { data: users } = await (supabaseAdmin.auth.admin as any).listUsers({ page: 1, perPage: 1000 });
      const usersArr: any[] = users?.users ?? [];
      for (const u of usersArr) if (ids.includes(u.id)) emailByUser.set(u.id, u.email ?? "");
    }
    return (members ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.created_at,
      full_name: profByUser.get(m.user_id)?.full_name ?? null,
      email: emailByUser.get(m.user_id) ?? null,
      is_blocked: profByUser.get(m.user_id)?.is_blocked ?? false,
    }));
  });