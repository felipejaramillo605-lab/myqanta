import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";
import { generateUniqueEmployeeId } from "./employee-id.server";

const CodeRe = /^[A-Za-z0-9_-]{2,32}$/;

const MemberInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().regex(CodeRe, "Código: 2-32 caracteres alfanuméricos, _ o -"),
  full_name: z.string().trim().min(1).max(120),
  cedula: z.string().trim().min(4).max(32),
  position: z.string().trim().max(120).nullable().optional(),
  phone_e164: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  photo_url: z.string().trim().max(2000).nullable().optional(),
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

// ===== Camino A: solicitud de alta creada por admin, aprobada por owner =====

const RequestInput = z.object({
  full_name: z.string().trim().min(1).max(120),
  cedula: z.string().trim().min(4).max(32),
  position: z.string().trim().max(120).nullable().optional(),
  phone_e164: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().email().max(255),
  notes: z.string().trim().max(500).nullable().optional(),
  photo_url: z.string().trim().max(2000).nullable().optional(),
  role: z.enum(["member", "viewer"]).default("member"),
});

function makeCode() {
  return "EMP-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

export const requestEmployeeCreation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RequestInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/team", "admin");
    const { data: out, error } = await context.supabase
      .from("team_members")
      .insert({
        org_id: orgId,
        created_by: context.userId,
        code: makeCode(),
        full_name: data.full_name,
        cedula: data.cedula,
        position: data.position ?? null,
        phone_e164: data.phone_e164 ?? null,
        email: data.email,
        notes: data.notes ?? null,
        photo_url: data.photo_url ?? null,
        status: "pending_approval",
        requested_role: data.role,
        requested_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const listPendingEmployeeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "owner");
    const { data, error } = await context.supabase
      .from("team_members")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const approveEmployeeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "owner");

    const { data: row, error: readErr } = await context.supabase
      .from("team_members")
      .select("*")
      .eq("id", data.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Solicitud no encontrada");
    if (row.status !== "pending_approval") throw new Error("Esta solicitud ya fue procesada");
    if (!row.email) throw new Error("La solicitud no tiene correo electrónico");
    if (!row.cedula) throw new Error("La solicitud no tiene cédula");

    const tempPassword = crypto.randomUUID().slice(0, 12);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: row.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: row.full_name },
    });
    if (createErr || !created?.user) {
      throw new Error(createErr?.message ?? "No se pudo crear el usuario");
    }
    const newUserId = created.user.id;

    const { error: memErr } = await supabaseAdmin
      .from("organization_members")
      .upsert(
        { org_id: orgId, user_id: newUserId, role: (row.requested_role ?? "member") as "member" | "viewer" },
        { onConflict: "org_id,user_id" },
      );
    if (memErr) throw new Error(memErr.message);

    const employeeId = await generateUniqueEmployeeId(
      context.supabase,
      orgId,
      row.cedula,
      row.position,
      new Date(),
    );

    const { error: updErr } = await context.supabase
      .from("team_members")
      .update({
        user_id: newUserId,
        employee_id: employeeId,
        status: "active",
        must_change_password: true,
      })
      .eq("id", row.id)
      .eq("org_id", orgId);
    if (updErr) throw new Error(updErr.message);

    return { tempPassword, employee_id: employeeId, email: row.email };
  });

export const rejectEmployeeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "owner");
    const { error } = await context.supabase
      .from("team_members")
      .update({ status: "rejected" })
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Camino B: el propio empleado completa sus datos al aceptar la invitación =====

export const completeEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        org_id: z.string().uuid(),
        cedula: z.string().trim().min(4).max(32),
        position: z.string().trim().max(120).nullable().optional(),
        photo_url: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    // Only a real member of that org can complete their own employee record.
    const { data: membership, error: memErr } = await context.supabase
      .from("organization_members")
      .select("org_id")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (memErr) throw new Error(memErr.message);
    if (!membership) throw new Error("No perteneces a esta organización");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: existing, error: exErr } = await context.supabase
      .from("team_members")
      .select("id, employee_id")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);

    const employeeId =
      existing?.employee_id ??
      (await generateUniqueEmployeeId(context.supabase, data.org_id, data.cedula, data.position, new Date()));

    const payload = {
      org_id: data.org_id,
      user_id: context.userId,
      full_name: profile?.full_name ?? "Empleado",
      cedula: data.cedula,
      position: data.position ?? null,
      photo_url: data.photo_url ?? null,
      status: "active",
      employee_id: employeeId,
      must_change_password: false,
    };

    if (existing) {
      const { error } = await context.supabase
        .from("team_members")
        .update(payload)
        .eq("id", existing.id)
        .eq("org_id", data.org_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("team_members")
        .insert({ ...payload, code: makeCode(), created_by: context.userId });
      if (error) throw new Error(error.message);
    }
    return { employee_id: employeeId };
  });

// ===== Primer ingreso: cambio de contraseña obligatorio =====

export const getMyEmployeeRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    if (!orgId) return null;
    const { data, error } = await context.supabase
      .from("team_members")
      .select("id, full_name, position, employee_id, photo_url, must_change_password, status")
      .eq("org_id", orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

export const clearMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("team_members")
      .update({ must_change_password: false })
      .eq("org_id", orgId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ photo_url: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("team_members")
      .update({ photo_url: data.photo_url })
      .eq("org_id", orgId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
