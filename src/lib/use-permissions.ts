import { useQuery } from "@tanstack/react-query";
import { listMyOrgs } from "@/lib/org.functions";
import type { OrgRole } from "@/lib/permissions";

const RANK: Record<OrgRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };

export function usePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orgs"],
    queryFn: () => listMyOrgs(),
  });
  const active = data?.orgs.find((o) => o.id === data?.activeOrgId);
  const role = (active?.role as OrgRole | undefined) ?? undefined;
  const rank = role ? RANK[role] : 0;
  return {
    loading: isLoading,
    role,
    isOwner: role === "owner",
    isAdmin: rank >= RANK.admin,
    canWrite: rank >= RANK.member,
    canManage: rank >= RANK.admin,
    isViewer: role === "viewer",
    /** Returns true if the user meets the minimum role. */
    atLeast: (min: OrgRole) => rank >= RANK[min],
  };
}