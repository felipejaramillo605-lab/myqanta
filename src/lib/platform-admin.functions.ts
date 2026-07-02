import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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