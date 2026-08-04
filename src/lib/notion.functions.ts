import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgWithRole, resolveOrgWithModuleAccess } from "./permissions";

/**
 * Genera el `state` firmado (HMAC, 10 min de validez) que autoriza el inicio
 * del flujo OAuth. Solo admin/owner de la org activa lo obtiene; la ruta
 * `/api/integrations/notion/authorize` lo verifica antes de redirigir a Notion.
 */
export const createNotionOAuthState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { signNotionState, notionCredentials } = await import("./notion.server");
    notionCredentials(); // falla con mensaje claro si faltan los secretos
    return { state: signNotionState(orgId, context.userId) };
  });

export const getNotionConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data, error } = await context.supabase
      .from("notion_connections" as never)
      .select("workspace_name, connected_at, database_id")
      .eq("org_id", orgId)
      .maybeSingle();
    // Los miembros sin permiso de admin no ven la fila por RLS: se reporta como sin conexión.
    if (error) return { connected: false, workspace_name: null, connected_at: null, database_id: null };
    const row = data as unknown as {
      workspace_name: string | null; connected_at: string; database_id: string | null;
    } | null;
    return {
      connected: !!row,
      workspace_name: row?.workspace_name ?? null,
      connected_at: row?.connected_at ?? null,
      database_id: row?.database_id ?? null,
    };
  });

export const disconnectNotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("notion_connections" as never)
      .delete()
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function requireToken(
  supabase: any,
  userId: string,
  orgId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("notion_connections")
    .select("access_token")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.access_token) throw new Error("Notion no está conectado para esta organización.");
  return data.access_token as string;
}

export const listNotionDatabases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const token = await requireToken(context.supabase, context.userId, orgId);
    const { notionFetch, plainTitle } = await import("./notion.server");
    const res = await notionFetch(token, "/search", {
      method: "POST",
      body: { filter: { property: "object", value: "database" }, page_size: 50 },
    });
    return ((res.results ?? []) as any[]).map((db) => ({ id: db.id as string, title: plainTitle(db) }));
  });

export const setNotionDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ database_id: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("notion_connections" as never)
      .update({ database_id: data.database_id } as never)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Sincroniza todos los contactos del CRM de la org activa hacia la base de
 * datos de Notion elegida: crea la página si no existe, la actualiza si ya
 * fue creada antes (`crm_contacts.notion_page_id`).
 */
export const syncContactsToNotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/crm", "member");
    await resolveOrgWithRole(context.supabase, context.userId, "admin");

    const { data: conn, error: connErr } = await context.supabase
      .from("notion_connections" as never)
      .select("access_token, database_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (connErr) throw new Error(connErr.message);
    const c = conn as unknown as { access_token: string; database_id: string | null } | null;
    if (!c?.access_token) throw new Error("Notion no está conectado para esta organización.");
    if (!c.database_id) throw new Error("Elige primero la base de datos de Notion a sincronizar.");

    const { data: contactRows, error: cErr } = await context.supabase
      .from("crm_contacts" as never)
      .select("id, name, email, phone, company, notion_page_id")
      .eq("org_id", orgId);
    if (cErr) throw new Error(cErr.message);
    const contacts = (contactRows ?? []) as unknown as Array<{
      id: string; name: string; email: string | null; phone: string | null;
      company: string | null; notion_page_id: string | null;
    }>;

    const { data: dealRows } = await context.supabase
      .from("crm_deals" as never)
      .select("contact_id, stage, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    const stageByContact = new Map<string, string>();
    for (const d of (dealRows ?? []) as unknown as Array<{ contact_id: string | null; stage: string }>) {
      if (d.contact_id && !stageByContact.has(d.contact_id)) stageByContact.set(d.contact_id, d.stage);
    }

    const { notionFetch, buildContactProperties } = await import("./notion.server");
    const db = await notionFetch(c.access_token, `/databases/${c.database_id}`);

    let created = 0, updated = 0, failed = 0;
    for (const contact of contacts) {
      const properties = buildContactProperties(db.properties ?? {}, {
        ...contact,
        stage: stageByContact.get(contact.id) ?? null,
      });
      try {
        let pageId = contact.notion_page_id;
        if (pageId) {
          try {
            await notionFetch(c.access_token, `/pages/${pageId}`, { method: "PATCH", body: { properties } });
            updated++;
          } catch {
            pageId = null; // la página fue borrada en Notion: se recrea
          }
        }
        if (!pageId) {
          const page = await notionFetch(c.access_token, "/pages", {
            method: "POST",
            body: { parent: { database_id: c.database_id }, properties },
          });
          await context.supabase
            .from("crm_contacts" as never)
            .update({ notion_page_id: page.id as string } as never)
            .eq("id", contact.id)
            .eq("org_id", orgId);
          created++;
        }
      } catch (e) {
        console.error(`Notion sync falló para el contacto ${contact.id}:`, e);
        failed++;
      }
    }
    return { created, updated, failed };
  });

export const pushContactToNotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ contact_id: z.string().uuid(), database_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/crm", "member");
    await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const token = await requireToken(context.supabase, context.userId, orgId);

    const { data: contact, error: cErr } = await context.supabase
      .from("crm_contacts" as never)
      .select("id, name, email, phone, company, notion_page_id")
      .eq("id", data.contact_id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    const c = contact as unknown as {
      id: string; name: string; email: string | null; phone: string | null;
      company: string | null; notion_page_id: string | null;
    } | null;
    if (!c) throw new Error("Contacto no encontrado.");

    const { notionFetch, buildContactProperties } = await import("./notion.server");
    const db = await notionFetch(token, `/databases/${data.database_id}`);
    const properties = buildContactProperties(db.properties ?? {}, c);

    let pageId = c.notion_page_id;
    if (pageId) {
      try {
        await notionFetch(token, `/pages/${pageId}`, { method: "PATCH", body: { properties } });
      } catch {
        pageId = null; // la página fue borrada o movida: se crea de nuevo
      }
    }
    if (!pageId) {
      const page = await notionFetch(token, "/pages", {
        method: "POST",
        body: { parent: { database_id: data.database_id }, properties },
      });
      pageId = page.id as string;
      const { error: uErr } = await context.supabase
        .from("crm_contacts" as never)
        .update({ notion_page_id: pageId } as never)
        .eq("id", c.id)
        .eq("org_id", orgId);
      if (uErr) throw new Error(uErr.message);
    }
    return { ok: true, page_id: pageId, mapped: Object.keys(properties).length };
  });
