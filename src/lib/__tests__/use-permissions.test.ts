import { describe, expect, it } from "vitest";
import { derivePermissions, ROLE_RANK } from "@/lib/use-permissions";
import type { OrgRole } from "@/lib/permissions";

const cases: Array<{
  role: OrgRole | undefined;
  canWrite: boolean;
  canManage: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isViewer: boolean;
}> = [
  { role: "owner",  canWrite: true,  canManage: true,  isAdmin: true,  isOwner: true,  isViewer: false },
  { role: "admin",  canWrite: true,  canManage: true,  isAdmin: true,  isOwner: false, isViewer: false },
  { role: "member", canWrite: true,  canManage: false, isAdmin: false, isOwner: false, isViewer: false },
  { role: "viewer", canWrite: false, canManage: false, isAdmin: false, isOwner: false, isViewer: true  },
  { role: undefined,canWrite: false, canManage: false, isAdmin: false, isOwner: false, isViewer: false },
];

describe("derivePermissions — UI flag matrix", () => {
  for (const c of cases) {
    it(`role=${c.role ?? "none"} → flags`, () => {
      const p = derivePermissions(c.role);
      expect(p.canWrite).toBe(c.canWrite);
      expect(p.canManage).toBe(c.canManage);
      expect(p.isAdmin).toBe(c.isAdmin);
      expect(p.isOwner).toBe(c.isOwner);
      expect(p.isViewer).toBe(c.isViewer);
    });
  }

  it("atLeast(min) follows the rank table", () => {
    expect(derivePermissions("member").atLeast("viewer")).toBe(true);
    expect(derivePermissions("member").atLeast("admin")).toBe(false);
    expect(derivePermissions("admin").atLeast("admin")).toBe(true);
    expect(derivePermissions("owner").atLeast("owner")).toBe(true);
    expect(derivePermissions("viewer").atLeast("member")).toBe(false);
    expect(derivePermissions(undefined).atLeast("viewer")).toBe(false);
  });

  it("rank ordering is owner > admin > member > viewer", () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.member);
    expect(ROLE_RANK.member).toBeGreaterThan(ROLE_RANK.viewer);
  });
});