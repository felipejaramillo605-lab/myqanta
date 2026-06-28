import { useQuery } from "@tanstack/react-query";
import { listMyOrgs } from "@/lib/org.functions";
import type { OrgRole } from "@/lib/permissions";

export const ROLE_RANK: Record<OrgRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };

/** Pure helper: derives the boolean permission flags for a role. Exported for tests. */
export function derivePermissions(role: OrgRole | undefined) {
  const rank = role ? ROLE_RANK[role] : 0;
  return {
    role,
    isOwner: role === "owner",
    isAdmin: rank >= ROLE_RANK.admin,
    canWrite: rank >= ROLE_RANK.member,
    canManage: rank >= ROLE_RANK.admin,
    isViewer: role === "viewer",
    atLeast: (min: OrgRole) => rank >= ROLE_RANK[min],
  };
}

export function usePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orgs"],
    queryFn: () => listMyOrgs(),
  });
  const active = data?.orgs.find((o) => o.id === data?.activeOrgId);
  const role = (active?.role as OrgRole | undefined) ?? undefined;
  return { loading: isLoading, ...derivePermissions(role) };
}