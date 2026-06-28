import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveActiveOrgId } from "./org-helpers";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

/**
 * Throws if the user does not have at least `minRole` in the given org.
 * Uses the SECURITY DEFINER `has_org_role` RPC so RLS recursion is avoided.
 */
export async function assertOrgRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
  minRole: OrgRole = "member",
): Promise<void> {
  const { data, error } = await (supabase.rpc as any)("has_org_role", {
    _org_id: orgId,
    _user_id: userId,
    _min_role: minRole,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(`Forbidden: requires ${minRole} role in this organization`);
  }
}

/**
 * Resolves the active org and asserts the caller has at least `minRole`.
 * Convenience wrapper used by every write server function.
 */
export async function resolveOrgWithRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  minRole: OrgRole = "member",
): Promise<string> {
  const orgId = await resolveActiveOrgId(supabase, userId);
  await assertOrgRole(supabase, userId, orgId, minRole);
  return orgId;
}

/**
 * For routes that take an explicit org_id (org management).
 */
export async function assertOrgRoleFor(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
  minRole: OrgRole = "admin",
): Promise<void> {
  await assertOrgRole(supabase, userId, orgId, minRole);
}