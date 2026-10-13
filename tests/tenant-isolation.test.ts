import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAuditLog } from "@/server/audit";
import type { Actor } from "@/server/auth/actor";
import { authenticate } from "@/server/auth/service";
import { tickets } from "@/server/db/schema";
import { NotFoundError, ValidationError } from "@/server/errors";
import { listMembers } from "@/server/team/service";
import {
  addComment,
  getDashboardStats,
  getTicket,
  listComments,
  listTicketActivity,
  listTickets,
  updateTicket,
} from "@/server/tickets/service";
import { ticketFiltersSchema } from "@/lib/validators/tickets";
import { createTestDb, type TestDb } from "./support/db";

/*
 * Two tenants share one database. Every read and write must be scoped to the
 * caller's organization, and ids from another tenant must behave like
 * missing rows (404), never leaking data or existence.
 */
let t: TestDb;
let northwindAgent: Actor;
let globexOwner: Actor;
let globexTicketId: string;
let northwindTicketId: string;

const filters = ticketFiltersSchema.parse({ pageSize: 100 });

beforeAll(async () => {
  t = await createTestDb();
  northwindAgent = await t.actor(t.seed.northwind.users.aisha);
  globexOwner = await t.actor(t.seed.globex.ownerId, t.seed.globex.orgId);
  const [g] = await t.db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orgId, t.seed.globex.orgId)).limit(1);
  const [n] = await t.db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orgId, t.seed.northwind.orgId)).limit(1);
  globexTicketId = g!.id;
  northwindTicketId = n!.id;
});

afterAll(() => t.handle.close());

describe("tenant isolation", () => {
  it("lists only the caller's own tickets", async () => {
    const northwind = await listTickets(t.db, northwindAgent, filters);
    const globex = await listTickets(t.db, globexOwner, filters);

    expect(northwind.total).toBeGreaterThan(10);
    expect(globex.total).toBe(2);
    expect(northwind.items.every((ticket) => !ticket.subject.startsWith("Globex"))).toBe(true);
    expect(globex.items.every((ticket) => ticket.subject.startsWith("Globex"))).toBe(true);
  });

  it("does not leak other tenants' tickets through search", async () => {
    const result = await listTickets(t.db, northwindAgent, { ...filters, q: "Globex" });
    expect(result.total).toBe(0);
  });

  it("returns 404 when reading another tenant's ticket by id", async () => {
    await expect(getTicket(t.db, northwindAgent, globexTicketId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getTicket(t.db, globexOwner, northwindTicketId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listComments(t.db, northwindAgent, globexTicketId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listTicketActivity(t.db, northwindAgent, globexTicketId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses cross-tenant writes and leaves the row untouched", async () => {
    const [before] = await t.db.select().from(tickets).where(eq(tickets.id, globexTicketId));
    await expect(updateTicket(t.db, northwindAgent, globexTicketId, { status: "closed" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(addComment(t.db, northwindAgent, globexTicketId, { body: "hi", isInternal: false })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const [after] = await t.db.select().from(tickets).where(eq(tickets.id, globexTicketId));
    expect(after).toEqual(before);
  });

  it("rejects assigning a ticket to a member of another organization", async () => {
    await expect(
      updateTicket(t.db, northwindAgent, northwindTicketId, { assigneeId: t.seed.globex.ownerId }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("scopes members, audit log and dashboard stats", async () => {
    const members = await listMembers(t.db, globexOwner);
    expect(members.map((m) => m.email)).toEqual(["gina@globex.test"]);

    const audit = await listAuditLog(t.db, t.seed.globex.orgId, { limit: 500 });
    expect(audit.length).toBeGreaterThan(0);
    const globexTicketIds = new Set(
      (await t.db.select({ id: tickets.id }).from(tickets).where(eq(tickets.orgId, t.seed.globex.orgId))).map((r) => r.id),
    );
    expect(audit.every((entry) => entry.entityId === null || globexTicketIds.has(entry.entityId))).toBe(true);

    const stats = await getDashboardStats(t.db, globexOwner);
    expect(Object.values(stats.statusCounts).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("cannot sign in to an organization the user doesn't belong to", async () => {
    await expect(
      authenticate(t.db, { email: "aisha@northwind.test", password: "opsdesk-demo", orgId: t.seed.globex.orgId }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
