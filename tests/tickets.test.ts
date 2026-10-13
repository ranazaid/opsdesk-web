import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ticketFiltersSchema } from "@/lib/validators/tickets";
import { auditLogs } from "@/server/db/schema";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { addComment, createTicket, getDashboardStats, listTickets, updateTicket } from "@/server/tickets/service";
import { createTestDb, type TestDb } from "./support/db";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.handle.close());

const newTicket = {
  subject: "Hero image is blurry on retina screens",
  description: "Looks pixelated on MacBooks.",
  requesterName: "Mia Russo",
  requesterEmail: "mia@russoceramics.com",
  priority: "normal" as const,
};

describe("ticket workflow", () => {
  it("numbers tickets sequentially per organization and audits creation", async () => {
    const agent = await t.actor(t.seed.northwind.users.aisha);
    const a = await createTicket(t.db, agent, newTicket);
    const b = await createTicket(t.db, agent, { ...newTicket, subject: "Second ticket" });
    expect(b.number).toBe(a.number + 1);

    const globexOwner = await t.actor(t.seed.globex.ownerId, t.seed.globex.orgId);
    const g = await createTicket(t.db, globexOwner, newTicket);
    expect(g.number).toBe(1003); // Globex has its own sequence

    const audit = await t.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, a.id), eq(auditLogs.action, "ticket.created")));
    expect(audit).toHaveLength(1);
  });

  it("records a field-level diff when a ticket changes and stamps resolvedAt", async () => {
    const agent = await t.actor(t.seed.northwind.users.aisha);
    const ticket = await createTicket(t.db, agent, newTicket);
    const updated = await updateTicket(t.db, agent, ticket.id, {
      status: "resolved",
      assigneeId: t.seed.northwind.users.marco,
    });
    expect(updated.status).toBe("resolved");
    expect(updated.resolvedAt).toBeInstanceOf(Date);
    expect(updated.assigneeName).toBe("Marco Rossi");

    const [entry] = await t.db.select().from(auditLogs).where(and(eq(auditLogs.entityId, ticket.id), eq(auditLogs.action, "ticket.updated")));
    expect(entry?.metadata).toEqual({
      changes: {
        status: { from: "open", to: "resolved" },
        assigneeId: { from: null, to: t.seed.northwind.users.marco },
      },
    });
  });

  it("does not allow viewers to be assigned or to write", async () => {
    const agent = await t.actor(t.seed.northwind.users.aisha);
    const viewer = await t.actor(t.seed.northwind.users.victor);
    const ticket = await createTicket(t.db, agent, newTicket);
    await expect(updateTicket(t.db, agent, ticket.id, { assigneeId: viewer.userId })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateTicket(t.db, viewer, ticket.id, { status: "closed" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addComment(t.db, viewer, ticket.id, { body: "hi", isInternal: false })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("filters the list by status, priority, assignee and search", async () => {
    const agent = await t.actor(t.seed.northwind.users.aisha);
    const base = ticketFiltersSchema.parse({ pageSize: 100 });
    const urgent = await listTickets(t.db, agent, { ...base, priority: "urgent" });
    expect(urgent.items.every((i) => i.priority === "urgent")).toBe(true);
    const mine = await listTickets(t.db, agent, { ...base, assignee: "me", status: "active" });
    expect(mine.items.every((i) => i.assigneeId === agent.userId && ["open", "pending"].includes(i.status))).toBe(true);
    const search = await listTickets(t.db, agent, { ...base, q: "timezone" });
    expect(search.items.map((i) => i.subject)).toEqual(["Booking widget shows wrong timezone for London clinic"]);
    const paged = await listTickets(t.db, agent, { ...base, pageSize: 5, page: 2 });
    expect(paged.items).toHaveLength(5);
  });

  it("computes dashboard stats with a 14-day series", async () => {
    const agent = await t.actor(t.seed.northwind.users.aisha);
    const stats = await getDashboardStats(t.db, agent);
    expect(stats.createdPerDay).toHaveLength(14);
    expect(stats.statusCounts.open).toBeGreaterThan(0);
    expect(stats.recentActivity.length).toBeLessThanOrEqual(8);
  });
});
