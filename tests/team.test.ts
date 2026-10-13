import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberships, tickets } from "@/server/db/schema";
import { ConflictError, ForbiddenError, PlanLimitError } from "@/server/errors";
import { addMember, changeMemberRole, listMembers, removeMember } from "@/server/team/service";
import { createTestDb, type TestDb } from "./support/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.handle.close());

describe("team management", () => {
  it("prevents admins from creating or demoting owners", async () => {
    const admin = await t.actor(t.seed.northwind.users.adam);
    await expect(addMember(t.db, admin, { email: "new-owner@x.io", name: "New Owner", role: "owner" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(changeMemberRole(t.db, admin, t.seed.northwind.users.olivia, "viewer")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("prevents agents from managing members at all", async () => {
    const agent = await t.actor(t.seed.northwind.users.aisha);
    await expect(changeMemberRole(t.db, agent, t.seed.northwind.users.victor, "agent")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeMember(t.db, agent, t.seed.northwind.users.victor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("always keeps at least one owner", async () => {
    const owner = await t.actor(t.seed.northwind.users.olivia);
    await changeMemberRole(t.db, owner, t.seed.northwind.users.adam, "owner");
    const adamAsOwner = await t.actor(t.seed.northwind.users.adam);
    await changeMemberRole(t.db, adamAsOwner, t.seed.northwind.users.olivia, "admin");
    const oliviaAsAdmin = await t.actor(t.seed.northwind.users.olivia);
    expect(oliviaAsAdmin.role).toBe("admin");
    await expect(changeMemberRole(t.db, oliviaAsAdmin, t.seed.northwind.users.adam, "admin")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const roles = (await listMembers(t.db, adamAsOwner)).filter((m) => m.role === "owner");
    expect(roles).toHaveLength(1);
    // The last owner cannot be removed or demoted, even by an owner.
    await t.db
      .insert(memberships)
      .values({ orgId: t.seed.northwind.orgId, userId: t.seed.globex.ownerId, role: "owner" })
      .onConflictDoNothing();
    const secondOwner = await t.actor(t.seed.globex.ownerId, t.seed.northwind.orgId);
    await removeMember(t.db, secondOwner, t.seed.northwind.users.adam);
    await expect(changeMemberRole(t.db, secondOwner, t.seed.globex.ownerId, "admin")).rejects.toBeInstanceOf(ConflictError);
  });

  it("returns a removed member's open tickets to the queue", async () => {
    const owner = await t.actor(t.seed.globex.ownerId, t.seed.northwind.orgId);
    const marco = t.seed.northwind.users.marco;
    const before = await t.db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.assigneeId, marco), eq(tickets.status, "open")));
    expect(before.length).toBeGreaterThan(0);
    await removeMember(t.db, owner, marco);
    const after = await t.db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.assigneeId, marco), eq(tickets.status, "open")));
    expect(after).toHaveLength(0);
  });

  it("enforces seat limits and rejects duplicate members", async () => {
    const owner = await t.actor(t.seed.globex.ownerId, t.seed.globex.orgId); // Free plan: 3 seats
    await addMember(t.db, owner, { email: "aisha@northwind.test", name: "Aisha", role: "agent" }); // existing user
    await expect(addMember(t.db, owner, { email: "aisha@northwind.test", name: "Aisha", role: "agent" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    const added = await addMember(t.db, owner, { email: "fresh@globex.test", name: "Fresh", role: "viewer" });
    expect(added.temporaryPassword).toHaveLength(16);
    await expect(addMember(t.db, owner, { email: "fourth@globex.test", name: "Fourth", role: "viewer" })).rejects.toBeInstanceOf(
      PlanLimitError,
    );
  });
});
