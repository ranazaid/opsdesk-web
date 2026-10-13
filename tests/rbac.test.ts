import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/domain";
import { can, canAssignRole, PERMISSION_MATRIX, PERMISSIONS, permissionsFor } from "@/lib/permissions";
import type { Actor } from "@/server/auth/actor";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { requirePermission } from "@/server/rbac";

const actor = (role: Actor["role"]): Actor => ({
  userId: "00000000-0000-4000-8000-000000000001",
  orgId: "00000000-0000-4000-8000-0000000000aa",
  role,
  email: `${role}@example.com`,
  name: role,
  orgName: "Acme",
  plan: "pro",
});

describe("permission matrix", () => {
  it("defines every role", () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...ROLES].sort());
  });

  it("gives owners every permission", () => {
    expect(permissionsFor("owner")).toEqual([...PERMISSIONS]);
  });

  it("matches the documented matrix", () => {
    expect(permissionsFor("admin")).not.toContain("billing:manage");
    expect(permissionsFor("admin")).toContain("billing:read");
    expect(permissionsFor("admin")).toContain("member:update_role");
    expect(permissionsFor("agent")).toEqual([
      "ticket:read",
      "ticket:create",
      "ticket:update",
      "ticket:assign",
      "comment:create",
      "comment:internal",
      "ai:use",
      "audit:read",
      "member:read",
    ]);
    expect(permissionsFor("viewer")).toEqual(["ticket:read", "audit:read", "member:read"]);
  });

  it("is strictly hierarchical: each role has a superset of the role below", () => {
    const order = ["viewer", "agent", "admin", "owner"] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = permissionsFor(order[i - 1]!);
      const higher = permissionsFor(order[i]!);
      expect(higher).toEqual(expect.arrayContaining(lower));
      expect(higher.length).toBeGreaterThan(lower.length);
    }
  });

  it("denies writes and AI to viewers", () => {
    for (const permission of ["ticket:create", "ticket:update", "comment:create", "ai:use", "billing:read"] as const) {
      expect(can("viewer", permission)).toBe(false);
    }
  });
});

describe("requirePermission()", () => {
  it("passes when the role has the permission", () => {
    expect(() => requirePermission(actor("agent"), "ticket:update")).not.toThrow();
  });

  it("throws 403 ForbiddenError when the role lacks it", () => {
    expect(() => requirePermission(actor("viewer"), "ticket:update")).toThrow(ForbiddenError);
    try {
      requirePermission(actor("agent"), "billing:manage");
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: "forbidden" });
    }
  });

  it("throws 401 UnauthorizedError for anonymous callers", () => {
    expect(() => requirePermission(null, "ticket:read")).toThrow(UnauthorizedError);
    expect(() => requirePermission(undefined, "ticket:read")).toThrow(UnauthorizedError);
  });
});

describe("canAssignRole()", () => {
  it("lets owners grant and revoke any role, including owner", () => {
    expect(canAssignRole("owner", "agent", "owner")).toBe(true);
    expect(canAssignRole("owner", "owner", "viewer")).toBe(true);
  });

  it("lets admins manage roles below owner only", () => {
    expect(canAssignRole("admin", "viewer", "agent")).toBe(true);
    expect(canAssignRole("admin", "agent", "admin")).toBe(true);
    expect(canAssignRole("admin", "agent", "owner")).toBe(false);
    expect(canAssignRole("admin", "owner", "viewer")).toBe(false);
  });

  it("never lets agents or viewers change roles", () => {
    expect(canAssignRole("agent", "viewer", "agent")).toBe(false);
    expect(canAssignRole("viewer", "viewer", "viewer")).toBe(false);
  });
});
