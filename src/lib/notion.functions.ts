import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgWithRole, resolveOrgWithModuleAccess } from "./permissions";

export const getNotionAuthUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { notionCredentials, notionRedirectUri } = await import("./notion.server");
    const { clientId } = notionCredentials();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      owner: "user",
      redirect_uri: notionRedirectUri(),
      state: orgId,
    });
    return { url: `https://api.notion.com/v1/oauth/authorize?${params.toString()}` };
  });

export const completeNotionOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().min(1), state: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    if (orgId !== data.state) {
      throw new Error("La conexión pertenece a otra organización.");
    }
    const { exchangeNotionCode, notionRedirectUri } = await import("./notion.server");
    const tokens = await exchangeNotionCode(data.code, notionRedirectUri());
    const { error } = await context.supabase
      .from("notion_connections" as never)
      .upsert(
        {
          org_id: orgId,
          access_token: tokens.access_token,
          workspace_id: tokens.workspace_id ?? null,
          workspace_name: tokens.workspace_name ?? null,
          bot_id: tokens.bot_id ?? null,
          connected_by: context.userId,
          connected_at: new Date().toISOString(),
        } as never,
        { onConflict: "org_id" } as never,
      );
    if (error) throw new Error(error.message);
    return { ok: true, workspace_name: tokens.workspace_name ?? null };
  });

export const getNotionConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data, error } = await context.supabase
      .from("notion_connections" as never)
      .select("workspace_name, connected_at")
      .eq("org_id", orgId)
      .maybeSingle();
    // Los miembros sin permiso de admin no ven la fila por RLS: se reporta como sin conexión.
    if (error) return { connected: false, workspace_name: null, connected_at: null };
    const row = data as unknown as { workspace_name: string | null; connected_at: string } | null;
    return {
      connected: !!row,
      workspace_name: row?.workspace_name ?? null,
      connected_at: row?.connected_at ?? null,
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
