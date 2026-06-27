import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Resolves the active organization for the authenticated user, falling back to
 * the first organization they belong to and persisting it to the profile.
 * Throws if the user has no organization (should not happen after signup).
 */
export async function resolveActiveOrgId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_org_id")
    .eq("id", userId)
    .maybeSingle();

  let orgId = profile?.active_org_id ?? null;
  if (orgId) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membership) return orgId;
    orgId = null;
  }

  const { data: first } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!first) throw new Error("No organization for user");

  await supabase.from("profiles").update({ active_org_id: first.org_id }).eq("id", userId);
  return first.org_id;
}