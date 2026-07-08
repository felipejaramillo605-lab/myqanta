import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertPlatformOwner(supabase: any, userId: string) {
  const { data } = await (supabase.rpc as any)("is_platform_owner", { _user_id: userId });
  if (!data) throw new Error("Forbidden");
}

export const getTrafficSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hours: z.number().int().min(1).max(720).default(24) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { data: r, error } = await (context.supabase.rpc as any)("platform_traffic_summary", { _hours: data.hours });
    if (error) throw new Error(error.message);
    return r as Record<string, number>;
  });

export const getTrafficSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hours: z.number().int().min(1).max(720).default(24) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { data: r, error } = await (context.supabase.rpc as any)("platform_traffic_series", { _hours: data.hours });
    if (error) throw new Error(error.message);
    return (r ?? []) as Array<{ bucket: string; requests: number; errors: number }>;
  });

export const getTopUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hours: z.number().int().min(1).max(720).default(24) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { data: r, error } = await (context.supabase.rpc as any)("platform_top_users", { _hours: data.hours, _limit: 30 });
    if (error) throw new Error(error.message);
    return (r ?? []) as Array<{ user_id: string; email: string; requests: number; errors: number; avg_ms: number; last_seen: string }>;
  });

export const getTopIps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hours: z.number().int().min(1).max(720).default(24) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { data: r, error } = await (context.supabase.rpc as any)("platform_top_ips", { _hours: data.hours, _limit: 30 });
    if (error) throw new Error(error.message);
    return (r ?? []) as Array<{ ip_hash: string; requests: number; errors: number; unique_users: number; watched: boolean; last_seen: string }>;
  });

export const getSuspicious = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ hours: z.number().int().min(1).max(720).default(24) }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { data: r, error } = await (context.supabase.rpc as any)("platform_suspicious", { _hours: data.hours });
    if (error) throw new Error(error.message);
    return (r ?? []) as Array<{ kind: string; subject: string; score: number; detail: Record<string, unknown> }>;
  });

export const addWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ip_hash: z.string().min(4).max(64), reason: z.string().max(300).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { error } = await (context.supabase.rpc as any)("platform_add_watch", { _ip_hash: data.ip_hash, _reason: data.reason ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ip_hash: z.string().min(4).max(64) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertPlatformOwner(context.supabase, context.userId);
    const { error } = await (context.supabase.rpc as any)("platform_remove_watch", { _ip_hash: data.ip_hash });
    if (error) throw new Error(error.message);
    return { ok: true };
  });