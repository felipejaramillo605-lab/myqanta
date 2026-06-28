import { describe, expect, it, vi } from "vitest";
import { assertOrgRole, resolveOrgWithRole, type OrgRole } from "@/lib/permissions";

const RANK: Record<OrgRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
const ROLES: OrgRole[] = ["owner", "admin", "member", "viewer"];
const ORG = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000aaa";

/** Mimics the SECURITY DEFINER has_org_role SQL function. */
function fakeSupabase(actualRole: OrgRole | null, opts: { profileOrg?: string | null } = {}) {
  return {
    rpc: vi.fn(async (_name: string, args: { _min_role: OrgRole }) => {
      if (!actualRole) return { data: false, error: null };
      return { data: RANK[actualRole] >= RANK[args._min_role], error: null };
    }),
    from: vi.fn((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        update: () => chain,
        maybeSingle: async () => {
          if (table === "profiles")
            return { data: { active_org_id: opts.profileOrg ?? ORG }, error: null };
          if (table === "organization_members")
            return { data: actualRole ? { org_id: ORG } : null, error: null };
          return { data: null, error: null };
        },
      };
      return chain;
    }),
  } as any;
}

describe("assertOrgRole — role matrix", () => {
  for (const actual of ROLES) {
    for (const min of ROLES) {
      const allowed = RANK[actual] >= RANK[min];
      it(`${actual} ${allowed ? "can" : "cannot"} act as ${min}`, async () => {
        const sb = fakeSupabase(actual);
        const call = assertOrgRole(sb, USER, ORG, min);
        if (allowed) await expect(call).resolves.toBeUndefined();
        else await expect(call).rejects.toThrow(/Forbidden/);
      });
    }
  }

  it("rejects users with no membership", async () => {
    const sb = fakeSupabase(null);
    await expect(assertOrgRole(sb, USER, ORG, "viewer")).rejects.toThrow(/Forbidden/);
  });

  it("surfaces RPC errors instead of silently allowing", async () => {
    const sb: any = { rpc: async () => ({ data: null, error: { message: "rpc boom" } }) };
    await expect(assertOrgRole(sb, USER, ORG, "member")).rejects.toThrow(/rpc boom/);
  });
});

describe("resolveOrgWithRole", () => {
  it("returns active org id when role suffices (member)", async () => {
    const sb = fakeSupabase("member");
    await expect(resolveOrgWithRole(sb, USER, "member")).resolves.toBe(ORG);
  });

  it("blocks viewer from member-level writes", async () => {
    const sb = fakeSupabase("viewer");
    await expect(resolveOrgWithRole(sb, USER, "member")).rejects.toThrow(/Forbidden/);
  });

  it("blocks member from admin-only actions", async () => {
    const sb = fakeSupabase("member");
    await expect(resolveOrgWithRole(sb, USER, "admin")).rejects.toThrow(/Forbidden/);
  });

  it("blocks admin from owner-only actions", async () => {
    const sb = fakeSupabase("admin");
    await expect(resolveOrgWithRole(sb, USER, "owner")).rejects.toThrow(/Forbidden/);
  });

  it("owner passes every level", async () => {
    const sb = fakeSupabase("owner");
    for (const min of ROLES) {
      await expect(resolveOrgWithRole(sb, USER, min)).resolves.toBe(ORG);
    }
  });
});