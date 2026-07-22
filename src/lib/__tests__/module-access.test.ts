import { describe, expect, it, vi } from "vitest";
import { assertModuleAccess, resolveOrgWithModuleAccess, type OrgRole } from "@/lib/permissions";

const RANK: Record<OrgRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
const ORG = "00000000-0000-0000-0000-000000000001";
const USER = "00000000-0000-0000-0000-000000000aaa";

/**
 * Mimics has_org_role + has_module_access. `actualRole` = null means no membership.
 * `allowedModules` = null means no custom_role (legacy behavior → RPC returns true).
 */
function fakeSupabase(
  actualRole: OrgRole | null,
  allowedModules: string[] | null = null,
) {
  return {
    rpc: vi.fn(async (name: string, args: any) => {
      if (name === "has_org_role") {
        if (!actualRole) return { data: false, error: null };
        return { data: RANK[actualRole] >= RANK[args._min_role], error: null };
      }
      if (name === "has_module_access") {
        if (!actualRole) return { data: false, error: null };
        if (actualRole === "owner" || actualRole === "admin") return { data: true, error: null };
        if (allowedModules === null) return { data: true, error: null }; // legacy
        return { data: allowedModules.includes(args._module), error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "profiles") return { data: { active_org_id: ORG }, error: null };
          if (table === "organization_members")
            return { data: actualRole ? { org_id: ORG } : null, error: null };
          return { data: null, error: null };
        },
      };
      return chain;
    }),
  } as any;
}

describe("assertModuleAccess", () => {
  it("owner passes regardless of allowed_modules", async () => {
    const sb = fakeSupabase("owner", []);
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).resolves.toBeUndefined();
  });

  it("admin passes regardless of allowed_modules", async () => {
    const sb = fakeSupabase("admin", []);
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).resolves.toBeUndefined();
  });

  it("member without custom_role_id passes (legacy)", async () => {
    const sb = fakeSupabase("member", null);
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).resolves.toBeUndefined();
  });

  it("viewer without custom_role_id passes (legacy)", async () => {
    const sb = fakeSupabase("viewer", null);
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).resolves.toBeUndefined();
  });

  it("member with custom_role including the module passes", async () => {
    const sb = fakeSupabase("member", ["/inventory", "/finance"]);
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).resolves.toBeUndefined();
  });

  it("member with custom_role excluding the module is forbidden", async () => {
    const sb = fakeSupabase("member", ["/finance"]);
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).rejects.toThrow(/Forbidden.*módulo/);
  });

  it("viewer with custom_role excluding the module is forbidden", async () => {
    const sb = fakeSupabase("viewer", []);
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).rejects.toThrow(/módulo/);
  });

  it("no membership fails", async () => {
    const sb = fakeSupabase(null, null);
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).rejects.toThrow(/Forbidden/);
  });

  it("propagates RPC errors", async () => {
    const sb: any = { rpc: async () => ({ data: null, error: { message: "rpc boom" } }) };
    await expect(assertModuleAccess(sb, USER, ORG, "/inventory")).rejects.toThrow(/rpc boom/);
  });
});

describe("resolveOrgWithModuleAccess", () => {
  it("owner passes for any module", async () => {
    const sb = fakeSupabase("owner", []);
    await expect(resolveOrgWithModuleAccess(sb, USER, "/hr", "member")).resolves.toBe(ORG);
  });

  it("admin passes for any module", async () => {
    const sb = fakeSupabase("admin", []);
    await expect(resolveOrgWithModuleAccess(sb, USER, "/hr", "member")).resolves.toBe(ORG);
  });

  it("member with matching custom_role passes", async () => {
    const sb = fakeSupabase("member", ["/hr"]);
    await expect(resolveOrgWithModuleAccess(sb, USER, "/hr", "member")).resolves.toBe(ORG);
  });

  it("member without allowed module is rejected", async () => {
    const sb = fakeSupabase("member", ["/finance"]);
    await expect(resolveOrgWithModuleAccess(sb, USER, "/hr", "member")).rejects.toThrow(/módulo/);
  });

  it("viewer cannot escalate to member minRole even with module access", async () => {
    const sb = fakeSupabase("viewer", ["/hr"]);
    await expect(resolveOrgWithModuleAccess(sb, USER, "/hr", "member")).rejects.toThrow(/Forbidden/);
  });
});