import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { TicketStatus } from "@/lib/domain";
import { can } from "@/lib/permissions";
import type {
  CreateCommentInput,
  CreateTicketInput,
  TicketFilters,
  UpdateTicketInput,
} from "@/lib/validators/tickets";
import { listAuditLog, recordAudit } from "@/server/audit";
import type { Actor } from "@/server/auth/actor";
import type { DbExecutor } from "@/server/db/client";
import { memberships, organizations, ticketComments, tickets, users } from "@/server/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { requirePermission } from "@/server/rbac";

/*
 * Tenant isolation: every query below filters on `actor.orgId`. A ticket id
 * from another organization is indistinguishable from a missing one (404).
 */

const ticketColumns = {
  id: tickets.id,
  number: tickets.number,
  subject: tickets.subject,
  status: tickets.status,
  priority: tickets.priority,
  requesterName: tickets.requesterName,
  requesterEmail: tickets.requesterEmail,
  assigneeId: tickets.assigneeId,
  assigneeName: users.name,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
  resolvedAt: tickets.resolvedAt,
};

function filterConditions(actor: Actor, filters: Partial<TicketFilters>): SQL[] {
  const conditions: SQL[] = [eq(tickets.orgId, actor.orgId)];
  if (filters.status === "active") conditions.push(inArray(tickets.status, ["open", "pending"]));
  else if (filters.status) conditions.push(eq(tickets.status, filters.status));
  if (filters.priority) conditions.push(eq(tickets.priority, filters.priority));
  if (filters.assignee === "me") conditions.push(eq(tickets.assigneeId, actor.userId));
  else if (filters.assignee === "unassigned") conditions.push(isNull(tickets.assigneeId));
  else if (filters.assignee) conditions.push(eq(tickets.assigneeId, filters.assignee));
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const numeric = Number.parseInt(filters.q.replace(/^#/, ""), 10);
    conditions.push(
      or(
        ilike(tickets.subject, pattern),
        ilike(tickets.requesterName, pattern),
        ilike(tickets.requesterEmail, pattern),
        ...(Number.isFinite(numeric) ? [eq(tickets.number, numeric)] : []),
      )!,
    );
  }
  return conditions;
}

export async function listTickets(db: DbExecutor, actor: Actor, filters: TicketFilters) {
  requirePermission(actor, "ticket:read");
  const where = and(...filterConditions(actor, filters));

  const [items, [totals]] = await Promise.all([
    db
      .select(ticketColumns)
      .from(tickets)
      .leftJoin(users, eq(users.id, tickets.assigneeId))
      .where(where)
      .orderBy(desc(tickets.updatedAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ total: count() }).from(tickets).where(where),
  ]);

  return { items, total: totals?.total ?? 0, page: filters.page, pageSize: filters.pageSize };
}

export type TicketListItem = Awaited<ReturnType<typeof listTickets>>["items"][number];

export async function getTicket(db: DbExecutor, actor: Actor, ticketId: string) {
  requirePermission(actor, "ticket:read");
  const [ticket] = await db
    .select({ ...ticketColumns, description: tickets.description })
    .from(tickets)
    .leftJoin(users, eq(users.id, tickets.assigneeId))
    .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, actor.orgId)))
    .limit(1);
  if (!ticket) throw new NotFoundError("Ticket not found");
  return ticket;
}

export type TicketDetail = Awaited<ReturnType<typeof getTicket>>;

export async function listComments(db: DbExecutor, actor: Actor, ticketId: string) {
  await getTicket(db, actor, ticketId); // 404s across tenants
  return db
    .select()
    .from(ticketComments)
    .where(and(eq(ticketComments.ticketId, ticketId), eq(ticketComments.orgId, actor.orgId)))
    .orderBy(asc(ticketComments.createdAt));
}

export async function listTicketActivity(db: DbExecutor, actor: Actor, ticketId: string) {
  requirePermission(actor, "audit:read");
  await getTicket(db, actor, ticketId);
  return listAuditLog(db, actor.orgId, { entityId: ticketId, limit: 30 });
}

/** Assignees must be agents (or above) of the same organization. */
async function assertAssignable(db: DbExecutor, orgId: string, userId: string) {
  const [member] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (!member) throw new ValidationError("Assignee is not a member of this organization");
  if (!can(member.role, "ticket:update")) throw new ValidationError("Viewers cannot be assigned tickets");
}

export async function createTicket(db: DbExecutor, actor: Actor, input: CreateTicketInput) {
  requirePermission(actor, "ticket:create");
  if (input.assigneeId) {
    requirePermission(actor, "ticket:assign");
    await assertAssignable(db, actor.orgId, input.assigneeId);
  }

  return db.transaction(async (tx) => {
    // Serialise numbering per organization: lock the org row, then take max + 1.
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, actor.orgId)).for("update");
    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(max(${tickets.number}), 1000) + 1`.mapWith(Number) })
      .from(tickets)
      .where(eq(tickets.orgId, actor.orgId));

    const [ticket] = await tx
      .insert(tickets)
      .values({
        orgId: actor.orgId,
        number: next,
        subject: input.subject,
        description: input.description,
        priority: input.priority,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        assigneeId: input.assigneeId ?? null,
        createdById: actor.userId,
      })
      .returning();
    if (!ticket) throw new Error("Ticket insert returned no row");

    await recordAudit(tx, actor, {
      action: "ticket.created",
      entityType: "ticket",
      entityId: ticket.id,
      metadata: { number: ticket.number, priority: ticket.priority },
    });
    return ticket;
  });
}

export async function updateTicket(db: DbExecutor, actor: Actor, ticketId: string, input: UpdateTicketInput) {
  requirePermission(actor, "ticket:update");
  const current = await getTicket(db, actor, ticketId);

  if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
    requirePermission(actor, "ticket:assign");
    if (input.assigneeId) await assertAssignable(db, actor.orgId, input.assigneeId);
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of ["subject", "status", "priority", "assigneeId"] as const) {
    const next = input[key];
    if (next !== undefined && next !== current[key]) changes[key] = { from: current[key], to: next };
  }
  if (Object.keys(changes).length === 0) return current;

  const closing: TicketStatus[] = ["resolved", "closed"];
  const resolvedAt =
    input.status === undefined ? undefined : closing.includes(input.status) ? (current.resolvedAt ?? new Date()) : null;

  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({
        subject: input.subject,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        resolvedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, actor.orgId)));
    await recordAudit(tx, actor, { action: "ticket.updated", entityType: "ticket", entityId: ticketId, metadata: { changes } });
  });

  return getTicket(db, actor, ticketId);
}

export async function addComment(db: DbExecutor, actor: Actor, ticketId: string, input: CreateCommentInput) {
  requirePermission(actor, "comment:create");
  if (input.isInternal && !can(actor.role, "comment:internal")) {
    throw new ForbiddenError("Your role cannot write internal notes");
  }
  await getTicket(db, actor, ticketId);

  return db.transaction(async (tx) => {
    const [comment] = await tx
      .insert(ticketComments)
      .values({
        orgId: actor.orgId,
        ticketId,
        authorId: actor.userId,
        authorName: actor.name,
        body: input.body,
        isInternal: input.isInternal,
      })
      .returning();
    await tx
      .update(tickets)
      .set({ updatedAt: new Date() })
      .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, actor.orgId)));
    await recordAudit(tx, actor, {
      action: input.isInternal ? "comment.internal_note" : "comment.created",
      entityType: "ticket",
      entityId: ticketId,
      metadata: { commentId: comment?.id },
    });
    if (!comment) throw new Error("Comment insert returned no row");
    return comment;
  });
}

/** Members who can be assigned tickets (agents and above). */
export async function listAssignableMembers(db: DbExecutor, actor: Actor) {
  requirePermission(actor, "ticket:read");
  return db
    .select({ id: users.id, name: users.name, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, actor.orgId), inArray(memberships.role, ["owner", "admin", "agent"])))
    .orderBy(asc(users.name));
}

export async function getDashboardStats(db: DbExecutor, actor: Actor, now = new Date()) {
  requirePermission(actor, "ticket:read");
  const DAY = 86_400_000;
  const since14 = new Date(now.getTime() - 13 * DAY);
  since14.setUTCHours(0, 0, 0, 0);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const org = eq(tickets.orgId, actor.orgId);

  const [byStatus, [urgent], [mine], [resolved7], perDay, recentActivity] = await Promise.all([
    db.select({ status: tickets.status, total: count() }).from(tickets).where(org).groupBy(tickets.status),
    db
      .select({ total: count() })
      .from(tickets)
      .where(and(org, eq(tickets.priority, "urgent"), inArray(tickets.status, ["open", "pending"]))),
    db
      .select({ total: count() })
      .from(tickets)
      .where(and(org, eq(tickets.assigneeId, actor.userId), inArray(tickets.status, ["open", "pending"]))),
    db.select({ total: count() }).from(tickets).where(and(org, gte(tickets.resolvedAt, since7))),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${tickets.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        total: count(),
      })
      .from(tickets)
      .where(and(org, gte(tickets.createdAt, since14)))
      .groupBy(sql`1`),
    listAuditLog(db, actor.orgId, { limit: 8 }),
  ]);

  const statusCounts = { open: 0, pending: 0, resolved: 0, closed: 0 } satisfies Record<TicketStatus, number>;
  for (const row of byStatus) statusCounts[row.status] = row.total;

  const totalsByDay = new Map(perDay.map((row) => [row.day, row.total]));
  const createdPerDay = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(since14.getTime() + i * DAY).toISOString().slice(0, 10);
    return { day, total: totalsByDay.get(day) ?? 0 };
  });

  return {
    statusCounts,
    urgentOpen: urgent?.total ?? 0,
    assignedToMe: mine?.total ?? 0,
    resolvedLast7Days: resolved7?.total ?? 0,
    createdPerDay,
    recentActivity,
  };
}

/** id -> name for everyone in the organization (used to render audit entries). */
export async function memberNameMap(db: DbExecutor, orgId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Link targets for audit entries that reference tickets. */
export async function ticketLinkMap(db: DbExecutor, actor: Actor, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, { href: string; label: string }>();
  const rows = await db
    .select({ id: tickets.id, number: tickets.number })
    .from(tickets)
    .where(and(eq(tickets.orgId, actor.orgId), inArray(tickets.id, unique)));
  return new Map(rows.map((row) => [row.id, { href: `/tickets/${row.id}`, label: `#${row.number}` }]));
}
