import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgWithRole } from "./permissions";

export type ObsidianConnectionStatus = {
  connected: boolean;
  base_url: string | null;
  vault_name: string | null;
  folder: string;
  connected_at: string | null;
  last_sync_at: string | null;
};

type ConnectionRow = {
  base_url: string;
  api_key_encrypted: string;
  vault_name: string | null;
  folder: string;
  connected_at: string;
  last_sync_at: string | null;
};

export const getObsidianConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ObsidianConnectionStatus> => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const empty: ObsidianConnectionStatus = {
      connected: false,
      base_url: null,
      vault_name: null,
      folder: "Qanta",
      connected_at: null,
      last_sync_at: null,
    };
    const { data, error } = await context.supabase
      .from("obsidian_connections" as never)
      .select("base_url, vault_name, folder, connected_at, last_sync_at")
      .eq("org_id", orgId)
      .maybeSingle();
    // Los miembros sin rol admin no ven la fila por RLS: se reporta como sin conexión.
    if (error) return empty;
    const row = data as unknown as Omit<ConnectionRow, "api_key_encrypted"> | null;
    if (!row) return empty;
    return {
      connected: true,
      base_url: row.base_url,
      vault_name: row.vault_name,
      folder: row.folder,
      connected_at: row.connected_at,
      last_sync_at: row.last_sync_at,
    };
  });

export const connectObsidian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        base_url: z.string().trim().min(1).max(300),
        api_key: z.string().trim().min(8).max(500),
        vault_name: z.string().trim().max(120).optional().default(""),
        folder: z.string().trim().max(160).optional().default("Qanta"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { normalizeVaultUrl, normalizeFolder, checkVault, encryptSecret } = await import("./obsidian.server");

    const baseUrl = normalizeVaultUrl(data.base_url);
    const folder = normalizeFolder(data.folder);
    const info = await checkVault(baseUrl, data.api_key);
    if (!info.authenticated) {
      throw new Error("Obsidian respondió, pero la clave de API no autenticó la sesión. Revísala en el plugin.");
    }

    const { error } = await context.supabase.from("obsidian_connections" as never).upsert(
      {
        org_id: orgId,
        base_url: baseUrl,
        api_key_encrypted: await encryptSecret(data.api_key),
        vault_name: data.vault_name || null,
        folder,
        connected_by: context.userId,
        connected_at: new Date().toISOString(),
      } as never,
      { onConflict: "org_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, base_url: baseUrl, folder, version: info.version };
  });

export const updateObsidianFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ folder: z.string().trim().max(160) }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { normalizeFolder } = await import("./obsidian.server");
    const folder = normalizeFolder(data.folder);
    const { error } = await context.supabase
      .from("obsidian_connections" as never)
      .update({ folder } as never)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true, folder };
  });

export const disconnectObsidian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("obsidian_connections" as never)
      .delete()
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testObsidianConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { data, error } = await context.supabase
      .from("obsidian_connections" as never)
      .select("base_url, api_key_encrypted")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as unknown as { base_url: string; api_key_encrypted: string } | null;
    if (!row) throw new Error("Obsidian no está conectado para esta organización.");
    const { decryptSecret, checkVault } = await import("./obsidian.server");
    const info = await checkVault(row.base_url, await decryptSecret(row.api_key_encrypted));
    return { ok: info.authenticated, service: info.service, version: info.version };
  });

export const syncToObsidian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { data: connData, error: connErr } = await context.supabase
      .from("obsidian_connections" as never)
      .select("base_url, api_key_encrypted, folder")
      .eq("org_id", orgId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    const conn = connData as unknown as { base_url: string; api_key_encrypted: string; folder: string } | null;
    if (!conn) throw new Error("Obsidian no está conectado para esta organización.");

    const now = new Date();
    const in14d = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();

    const [orgRes, tasksRes, eventsRes, productsRes, dealsRes] = await Promise.all([
      context.supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      context.supabase
        .from("tasks")
        .select("title,due_date,status,priority")
        .eq("org_id", orgId)
        .neq("status", "done")
        .neq("status", "archived")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(100),
      context.supabase
        .from("events")
        .select("title,starts_at,location")
        .eq("org_id", orgId)
        .gte("starts_at", now.toISOString())
        .lte("starts_at", in14d)
        .order("starts_at")
        .limit(100),
      context.supabase
        .from("inv_products")
        .select("name,stock,min_stock,unit")
        .eq("org_id", orgId)
        .gt("min_stock", 0)
        .order("name")
        .limit(200),
      context.supabase
        .from("crm_deals")
        .select("title,stage,amount,currency")
        .eq("org_id", orgId)
        .not("stage", "in", "(won,lost)")
        .order("amount", { ascending: false, nullsFirst: false })
        .limit(100),
    ]);

    const { buildSummaryNote, putNote, decryptSecret } = await import("./obsidian.server");
    const note = buildSummaryNote(
      {
        orgName: orgRes.data?.name ?? "Qanta",
        tasks: (tasksRes.data ?? []).map((t) => ({
          title: t.title,
          due_date: t.due_date,
          status: t.status,
          priority: t.priority,
        })),
        events: (eventsRes.data ?? []).map((e) => ({
          title: e.title,
          starts_at: e.starts_at,
          location: e.location,
        })),
        lowStock: (productsRes.data ?? [])
          .filter((p) => Number(p.stock) <= Number(p.min_stock))
          .map((p) => ({
            name: p.name,
            stock: Number(p.stock),
            min_stock: Number(p.min_stock),
            unit: p.unit,
          })),
        deals: (dealsRes.data ?? []).map((d) => ({
          title: d.title,
          stage: d.stage,
          amount: d.amount == null ? null : Number(d.amount),
          currency: d.currency ?? null,
        })),
      },
      now,
    );

    const path = `${conn.folder}/Qanta — Resumen ${now.toISOString().slice(0, 10)}.md`;
    await putNote(conn.base_url, await decryptSecret(conn.api_key_encrypted), path, note);

    await context.supabase
      .from("obsidian_connections" as never)
      .update({ last_sync_at: now.toISOString() } as never)
      .eq("org_id", orgId);

    return {
      ok: true,
      path,
      tasks: tasksRes.data?.length ?? 0,
      events: eventsRes.data?.length ?? 0,
      deals: dealsRes.data?.length ?? 0,
    };
  });
