import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveActiveOrgId } from "./org-helpers";
import { assertOrgRole, assertOrgRoleFor } from "./permissions";
import { sendGmail, isValidEmail } from "./gmail.server";

const OrgRole = z.enum(["owner", "admin", "member", "viewer"]);

export const listMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: memberships, error }, { data: profile }] = await Promise.all([
      context.supabase
        .from("organization_members")
        .select("role, organizations(id,name,slug,created_at)")
        .eq("user_id", context.userId),
      context.supabase.from("profiles").select("active_org_id").eq("id", context.userId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    const orgs = (memberships ?? [])
      .map((m) => m.organizations ? { ...m.organizations, role: m.role } : null)
      .filter(Boolean) as Array<{ id: string; name: string; slug: string; created_at: string; role: string }>;
    return { orgs, activeOrgId: profile?.active_org_id ?? null };
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `org-${Date.now()}`;
    const { data: org, error } = await context.supabase
      .from("organizations")
      .insert({ name: data.name, slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const { error: mErr } = await context.supabase
      .from("organization_members")
      .insert({ org_id: org.id, user_id: context.userId, role: "owner" });
    if (mErr) throw new Error(mErr.message);
    await (context.supabase.rpc as any)("seed_standard_puc", { _org_id: org.id });
    await context.supabase.from("profiles").update({ active_org_id: org.id }).eq("id", context.userId);
    return org;
  });

export const setActiveOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ org_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: membership, error } = await context.supabase
      .from("organization_members")
      .select("org_id")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!membership) throw new Error("Not a member of this organization");
    await context.supabase.from("profiles").update({ active_org_id: data.org_id }).eq("id", context.userId);
    return { ok: true };
  });

export const renameOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ org_id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertOrgRoleFor(context.supabase, context.userId, data.org_id, "admin");
    const { error } = await context.supabase
      .from("organizations")
      .update({ name: data.name })
      .eq("id", data.org_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
      profilesById = new Map((profs ?? []).map((p) => [p.id, { full_name: p.full_name }]));
    }
    const enriched = (members ?? []).map((m) => ({
      ...m,
      full_name: profilesById.get(m.user_id)?.full_name ?? null,
      is_me: m.user_id === context.userId,
    }));
    return { orgId, members: enriched };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), role: OrgRole }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    await assertOrgRole(context.supabase, context.userId, orgId, "admin");
    // Only owners can grant the owner role
    if (data.role === "owner") {
      await assertOrgRole(context.supabase, context.userId, orgId, "owner");
    }
    if (data.user_id === context.userId) {
      throw new Error("You can't change your own role");
    }
    const { error } = await context.supabase
      .from("organization_members")
      .update({ role: data.role })
      .eq("org_id", orgId)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    await assertOrgRole(context.supabase, context.userId, orgId, "admin");
    if (data.user_id === context.userId) {
      throw new Error("You can't remove yourself; transfer ownership first");
    }
    const { error } = await context.supabase
      .from("organization_members")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Invitations =====
function makeToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 8);
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    await assertOrgRole(context.supabase, context.userId, orgId, "admin");
    const { data, error } = await context.supabase
      .from("organization_invites")
      .select("id, invited_email, role, token, expires_at, accepted_at, revoked_at, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { orgId, invites: data ?? [] };
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().email().optional().nullable(),
      role: OrgRole.default("member"),
      custom_role_id: z.string().uuid().nullable().optional(),
      ttl_days: z.number().int().min(1).max(60).default(14),
      origin: z.string().trim().url().max(300).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    await assertOrgRole(context.supabase, context.userId, orgId, "admin");
    if (data.role === "owner") {
      await assertOrgRole(context.supabase, context.userId, orgId, "owner");
    }
    const token = makeToken();
    const expires = new Date(Date.now() + data.ttl_days * 86400 * 1000).toISOString();
    // Custom roles only apply to member/viewer, like the manual assignment flow.
    let customRoleId: string | null =
      data.role === "member" || data.role === "viewer" ? (data.custom_role_id ?? null) : null;
    if (customRoleId) {
      const { data: cr, error: crErr } = await context.supabase
        .from("custom_roles")
        .select("org_id")
        .eq("id", customRoleId)
        .maybeSingle();
      if (crErr) throw new Error(crErr.message);
      if (!cr || cr.org_id !== orgId) throw new Error("El rol personalizado no pertenece a esta organización.");
    }
    const { data: row, error } = await context.supabase
      .from("organization_invites")
      .insert({
        org_id: orgId,
        invited_email: data.email || null,
        role: data.role,
        custom_role_id: customRoleId,
        token,
        invited_by: context.userId,
        expires_at: expires,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Best-effort email delivery. Never fail the invite creation on email issues.
    if (data.email && isValidEmail(data.email) && data.origin) {
      try {
        const { data: org } = await context.supabase
          .from("organizations")
          .select("name")
          .eq("id", orgId)
          .maybeSingle();
        const orgName = org?.name ?? "Qanta";
        const link = `${data.origin.replace(/\/+$/, "")}/invite/${token}`;
        const subject = `Invitación a ${orgName} en Qanta`;
        const body =
          `Hola,\n\nHas sido invitado(a) a unirte a "${orgName}" en Qanta con el rol de ${data.role}.\n\n` +
          `Acepta la invitación abriendo este enlace:\n${link}\n\n` +
          `El enlace caduca el ${new Date(expires).toLocaleString()}.\n\n— Qanta`;
        const res = await sendGmail(data.email, subject, body);
        if (!res.ok) console.warn("[invite email] send failed:", res.error);
      } catch (e) {
        console.warn("[invite email] unexpected error:", (e as Error).message);
      }
    }

    return row;
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    await assertOrgRole(context.supabase, context.userId, orgId, "admin");
    const { error } = await context.supabase
      .from("organization_invites")
      .delete()
      .eq("org_id", orgId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: orgId, error } = await (context.supabase.rpc as any)("accept_invite", { _token: data.token });
    if (error) throw new Error(error.message);
    if (orgId) {
      await context.supabase.from("profiles").update({ active_org_id: orgId as string }).eq("id", context.userId);
    }
    return { org_id: orgId as string | null };
  });
/**
 * Adds an EXISTING Qanta user (by email) to the active organization, or updates
 * their role/custom role if already a member. Lets an owner/admin reassign users
 * that signed up on their own and ended up in a separate workspace.
 */
export const addMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().email().max(255),
      role: OrgRole.default("member"),
      custom_role_id: z.string().uuid().nullable().optional(),
      make_active: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    await assertOrgRole(context.supabase, context.userId, orgId, "admin");
    if (data.role === "owner") {
      await assertOrgRole(context.supabase, context.userId, orgId, "owner");
    }

    let customRoleId: string | null =
      data.role === "member" || data.role === "viewer" ? (data.custom_role_id ?? null) : null;
    if (customRoleId) {
      const { data: cr, error: crErr } = await context.supabase
        .from("custom_roles")
        .select("org_id")
        .eq("id", customRoleId)
        .maybeSingle();
      if (crErr) throw new Error(crErr.message);
      if (!cr || cr.org_id !== orgId) throw new Error("El rol personalizado no pertenece a esta organización.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    let targetId: string | null = null;
    for (let page = 1; page <= 10 && !targetId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const hit = (list?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
      if (hit) targetId = hit.id;
      if ((list?.users ?? []).length < 200) break;
    }
    if (!targetId) {
      throw new Error("Ese correo no tiene una cuenta en Qanta todavía. Envíale una invitación al equipo.");
    }

    const { error } = await context.supabase
      .from("organization_members")
      .upsert(
        { org_id: orgId, user_id: targetId, role: data.role, custom_role_id: customRoleId },
        { onConflict: "org_id,user_id" },
      );
    if (error) throw new Error(error.message);

    if (data.make_active) {
      await supabaseAdmin.from("profiles").update({ active_org_id: orgId }).eq("id", targetId);
    }
    return { ok: true, user_id: targetId };
  });
