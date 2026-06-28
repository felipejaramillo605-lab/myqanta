import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static spec test: every write/admin server function MUST be guarded with the
 * correct minimum role. This locks the role contract so future edits cannot
 * silently downgrade a permission gate.
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

type Spec = { file: string; fn: string; min: "member" | "admin" | "owner" };

const MEMBER_WRITES: Spec[] = [
  // Finance
  { file: "lib/finance.functions.ts", fn: "createTransaction", min: "member" },
  { file: "lib/finance.functions.ts", fn: "commitStatement", min: "member" },
  // Inventory
  { file: "lib/inventory.functions.ts", fn: "upsertProduct", min: "member" },
  { file: "lib/inventory.functions.ts", fn: "deleteProduct", min: "member" },
  { file: "lib/inventory.functions.ts", fn: "createMovement", min: "member" },
  { file: "lib/inventory.functions.ts", fn: "createPurchaseOrder", min: "member" },
  { file: "lib/inventory.functions.ts", fn: "commitInvoice", min: "member" },
  // Productivity
  { file: "lib/productivity.functions.ts", fn: "upsertTask", min: "member" },
  { file: "lib/productivity.functions.ts", fn: "deleteTask", min: "member" },
  { file: "lib/productivity.functions.ts", fn: "createHabit", min: "member" },
  { file: "lib/productivity.functions.ts", fn: "toggleHabit", min: "member" },
  { file: "lib/productivity.functions.ts", fn: "upsertEvent", min: "member" },
  { file: "lib/productivity.functions.ts", fn: "deleteEvent", min: "member" },
];

const ADMIN_ONLY: Spec[] = [
  { file: "lib/org.functions.ts", fn: "renameOrganization", min: "admin" },
  { file: "lib/org.functions.ts", fn: "updateMemberRole", min: "admin" },
  { file: "lib/org.functions.ts", fn: "removeMember", min: "admin" },
  { file: "lib/org.functions.ts", fn: "listInvites", min: "admin" },
  { file: "lib/org.functions.ts", fn: "createInvite", min: "admin" },
  { file: "lib/org.functions.ts", fn: "revokeInvite", min: "admin" },
];

/** Returns the source slice of the named export's handler, or null if not present. */
function extractFn(src: string, fnName: string): string | null {
  const start = src.indexOf(`export const ${fnName} `);
  if (start === -1) return null;
  // Take everything until the next `export const ` or end of file.
  const rest = src.slice(start + 1);
  const nextIdx = rest.indexOf("\nexport const ");
  return nextIdx === -1 ? src.slice(start) : src.slice(start, start + 1 + nextIdx);
}

describe("server functions — write guards", () => {
  for (const s of MEMBER_WRITES) {
    it(`${s.fn} requires at least 'member'`, () => {
      const body = extractFn(read(s.file), s.fn);
      expect(body, `missing export ${s.fn} in ${s.file}`).not.toBeNull();
      expect(body!).toMatch(/resolveOrgWithRole\([^)]*?,\s*["']member["']\s*\)/);
    });
  }

  for (const s of ADMIN_ONLY) {
    it(`${s.fn} requires at least 'admin'`, () => {
      const body = extractFn(read(s.file), s.fn);
      expect(body, `missing export ${s.fn} in lib/org.functions.ts`).not.toBeNull();
      expect(body!).toMatch(/assertOrgRole(For)?\([^)]*?,\s*["']admin["']\s*\)/);
    });
  }

  it("owner-only escalation: granting 'owner' role re-checks owner", () => {
    const src = read("lib/org.functions.ts");
    const update = extractFn(src, "updateMemberRole")!;
    const invite = extractFn(src, "createInvite")!;
    expect(update).toMatch(/role === "owner"[\s\S]*?assertOrgRole\([^)]*?,\s*"owner"\s*\)/);
    expect(invite).toMatch(/role === "owner"[\s\S]*?assertOrgRole\([^)]*?,\s*"owner"\s*\)/);
  });

  it("self-protection: cannot demote or remove yourself", () => {
    const src = read("lib/org.functions.ts");
    expect(extractFn(src, "updateMemberRole")!).toMatch(/user_id === context\.userId/);
    expect(extractFn(src, "removeMember")!).toMatch(/user_id === context\.userId/);
  });

  it("public read functions intentionally have no write guard", () => {
    // listMyOrgs, listMembers, setActiveOrg are membership checks, not role gates.
    const src = read("lib/org.functions.ts");
    for (const fn of ["listMyOrgs", "listMembers", "setActiveOrg"]) {
      const body = extractFn(src, fn)!;
      expect(body).not.toMatch(/resolveOrgWithRole/);
    }
  });
});

describe("routes — protected vs public placement", () => {
  const PROTECTED = [
    "dashboard.tsx",
    "finance.tsx",
    "inventory.tsx",
    "habits.tsx",
    "agenda.tsx",
    "settings.team.tsx",
    "admin.theme.tsx",
    "route.tsx",
  ];
  const PUBLIC = ["index.tsx", "auth.tsx", "invite.$token.tsx"];

  for (const f of PROTECTED) {
    it(`/_authenticated/${f} is gated by the auth layout`, () => {
      expect(existsSync(resolve(ROOT, `routes/_authenticated/${f}`))).toBe(true);
    });
  }

  for (const f of PUBLIC) {
    it(`/${f} stays public (top-level route)`, () => {
      expect(existsSync(resolve(ROOT, `routes/${f}`))).toBe(true);
      expect(existsSync(resolve(ROOT, `routes/_authenticated/${f}`))).toBe(false);
    });
  }

  it("_authenticated/route.tsx redirects unauthenticated users to /auth", () => {
    const src = read("routes/_authenticated/route.tsx");
    expect(src).toMatch(/redirect\(\{\s*to:\s*"\/auth"/);
  });
});