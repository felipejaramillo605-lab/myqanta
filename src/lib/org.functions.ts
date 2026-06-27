import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveActiveOrgId } from "./org-helpers";

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
      .insert({ name: data.name, slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`, owner_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const { error: mErr } = await context.supabase
      .from("organization_members")
      .insert({ org_id: org.id, user_id: context.userId, role: "owner" });
    if (mErr) throw new Error(mErr.message);
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
      .select("user_id, role, created_at, profiles(full_name, email)")
      .eq("org_id", orgId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return { orgId, members: members ?? [] };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), role: OrgRole }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const { data, error } = await context.supabase
      .from("organization_invites")
      .select("id, email, role, token, expires_at, accepted_at, created_at")
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
      ttl_days: z.number().int().min(1).max(60).default(14),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const token = makeToken();
    const expires = new Date(Date.now() + data.ttl_days * 86400 * 1000).toISOString();
    const { data: row, error } = await context.supabase
      .from("organization_invites")
      .insert({
        org_id: orgId,
        email: data.email || null,
        role: data.role,
        token,
        invited_by: context.userId,
        expires_at: expires,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("organization_invites")
      .delete()
      .eq("org_id", orgId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const lookupInvite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: row, error } = await supabase.rpc("lookup_invite", { p_token: data.token });
    if (error) throw new Error(error.message);
    return row;
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: orgId, error } = await context.supabase.rpc("accept_invite", { p_token: data.token });
    if (error) throw new Error(error.message);
    if (orgId) {
      await context.supabase.from("profiles").update({ active_org_id: orgId }).eq("id", context.userId);
    }
    return { org_id: orgId };
  });