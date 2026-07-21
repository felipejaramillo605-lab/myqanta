import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";

export type DocumentRow = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  mime_type: string | null;
  size_bytes: number;
  storage_path: string;
  tags: string[];
  entity_type: string | null;
  entity_id: string | null;
  uploaded_by: string;
  created_at: string;
};

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      q: z.string().trim().max(200).optional(),
      tag: z.string().trim().max(60).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    let q = context.supabase
      .from("documents" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    if (data.tag) q = q.contains("tags", [data.tag] as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as DocumentRow[];
  });

// Ask the server for a signed URL the browser can PUT to. The path is
// prefixed with the org_id so storage RLS policies can authorize the write.
export const createDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(200),
      mime_type: z.string().trim().max(160).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/documents", "member");
    const safe = sanitize(data.name);
    const path = `${orgId}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
    const { data: signed, error } = await context.supabase.storage
      .from("documents")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "No se pudo crear la URL de subida");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

const RegisterInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  mime_type: z.string().trim().max(160).nullable().optional(),
  size_bytes: z.number().int().nonnegative().default(0),
  storage_path: z.string().trim().min(1),
  tags: z.array(z.string().trim().max(60)).default([]),
  entity_type: z.string().trim().max(40).nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
});

export const registerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/documents", "member");
    // Enforce that storage_path lives under this org's folder.
    if (!data.storage_path.startsWith(`${orgId}/`)) {
      throw new Error("Ruta de almacenamiento inválida");
    }
    const payload: Record<string, unknown> = {
      ...data,
      description: data.description ?? null,
      mime_type: data.mime_type ?? null,
      entity_type: data.entity_type ?? null,
      entity_id: data.entity_id ?? null,
      org_id: orgId,
      uploaded_by: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("documents" as never)
      .insert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const getDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data: doc, error } = await context.supabase
      .from("documents" as never)
      .select("id, org_id, storage_path, name")
      .eq("id", data.id)
      .eq("org_id", orgId)
      .single();
    if (error || !doc) throw new Error(error?.message ?? "Documento no encontrado");
    const d = doc as unknown as { storage_path: string; name: string };
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("documents")
      .createSignedUrl(d.storage_path, 60 * 10);
    if (sErr || !signed) throw new Error(sErr?.message ?? "No se pudo firmar la URL");
    return { url: signed.signedUrl, name: d.name };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/documents", "member");
    const { data: doc, error: gErr } = await context.supabase
      .from("documents" as never)
      .select("storage_path, org_id")
      .eq("id", data.id)
      .eq("org_id", orgId)
      .single();
    if (gErr || !doc) throw new Error(gErr?.message ?? "Documento no encontrado");
    const path = (doc as unknown as { storage_path: string }).storage_path;
    await context.supabase.storage.from("documents").remove([path]);
    const { error } = await context.supabase.from("documents" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
