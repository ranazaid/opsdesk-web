import { sql } from "drizzle-orm";
import { DEMO_ACCOUNTS, DEMO_ORG, DEMO_PASSWORD, SECOND_DEMO_ORG, SECOND_ORG_ACCOUNT } from "@/lib/demo-accounts";
import type { Plan, Role } from "@/lib/domain";
import { hashPassword } from "@/server/auth/password";
import type { Database } from "./client";
import { auditLogs, memberships, organizations, ticketComments, tickets, users } from "./schema";
import { GLOBEX_TICKETS, NORTHWIND_TICKETS, type SeedTicket, type StaffKey } from "./seed-data";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface SeedResult {
  northwind: { orgId: string; users: Record<StaffKey | "victor", string> };
  globex: { orgId: string; ownerId: string };
}

/**
 * Resets and loads deterministic demo data: two organizations (to show tenant
 * isolation), a user for every role, and a realistic support queue.
 */
export async function seedDemoData(
  db: Database,
  options: { now?: Date; passwordRounds?: number } = {},
): Promise<SeedResult> {
  const now = options.now ?? new Date();
  const passwordHash = await hashPassword(DEMO_PASSWORD, options.passwordRounds);

  return db.transaction(async (tx) => {
    await tx.execute(sql`truncate table organizations, users, stripe_events restart identity cascade`);

    const [northwind] = await tx
      .insert(organizations)
      .values({
        name: DEMO_ORG.name,
        slug: DEMO_ORG.slug,
        plan: "pro" satisfies Plan,
        subscriptionStatus: "active",
        currentPeriodEnd: new Date(now.getTime() + 18 * DAY),
        createdAt: new Date(now.getTime() - 90 * DAY),
      })
      .returning();
    const [globex] = await tx
      .insert(organizations)
      .values({ name: SECOND_DEMO_ORG.name, slug: SECOND_DEMO_ORG.slug, plan: "free" })
      .returning();
    if (!northwind || !globex) throw new Error("Failed to create organizations");

    const insertedUsers = await tx
      .insert(users)
      .values([...DEMO_ACCOUNTS, SECOND_ORG_ACCOUNT].map(({ email, name }) => ({ email, name, passwordHash })))
      .returning({ id: users.id, email: users.email });
    const idByEmail = new Map(insertedUsers.map((u) => [u.email, u.id]));
    const userId = (email: string) => {
      const id = idByEmail.get(email);
      if (!id) throw new Error(`Seed user missing: ${email}`);
      return id;
    };

    await tx.insert(memberships).values([
      ...DEMO_ACCOUNTS.map((account, index) => ({
        orgId: northwind.id,
        userId: userId(account.email),
        role: account.role,
        createdAt: new Date(now.getTime() - (90 - index) * DAY),
      })),
      { orgId: globex.id, userId: userId(SECOND_ORG_ACCOUNT.email), role: SECOND_ORG_ACCOUNT.role as Role },
    ]);

    const staff: Record<StaffKey | "victor", string> = {
      olivia: userId("olivia@northwind.test"),
      adam: userId("adam@northwind.test"),
      aisha: userId("aisha@northwind.test"),
      marco: userId("marco@northwind.test"),
      victor: userId("victor@northwind.test"),
    };
    const staffNames: Record<StaffKey, string> = {
      olivia: "Olivia Bennett",
      adam: "Adam Clarke",
      aisha: "Aisha Khan",
      marco: "Marco Rossi",
    };

    async function insertQueue(orgId: string, queue: SeedTicket[], fallbackCreator: string, assignees: boolean) {
      // Oldest first so ticket numbers increase with creation time.
      const ordered = [...queue].sort((a, b) => b.daysAgo - a.daysAgo);
      for (const [index, seed] of ordered.entries()) {
        const createdAt = new Date(now.getTime() - seed.daysAgo * DAY - ((index * 7) % 9) * HOUR - HOUR);
        const lastMessageAt = seed.thread.at(-1)?.hoursAfter ?? 0;
        const updatedAt = new Date(Math.min(now.getTime(), createdAt.getTime() + lastMessageAt * HOUR));
        const closed = seed.status === "resolved" || seed.status === "closed";
        const assigneeId = assignees && seed.assignee ? staff[seed.assignee] : null;

        const [ticket] = await tx
          .insert(tickets)
          .values({
            orgId,
            number: 1001 + index,
            subject: seed.subject,
            description: seed.description,
            status: seed.status,
            priority: seed.priority,
            requesterName: seed.requester[0],
            requesterEmail: seed.requester[1],
            assigneeId,
            createdById: fallbackCreator,
            createdAt,
            updatedAt,
            resolvedAt: closed ? updatedAt : null,
          })
          .returning({ id: tickets.id });
        if (!ticket) throw new Error("Failed to create ticket");

        await tx.insert(auditLogs).values({
          orgId,
          actorId: fallbackCreator,
          action: "ticket.created",
          entityType: "ticket",
          entityId: ticket.id,
          metadata: { number: 1001 + index, priority: seed.priority },
          createdAt,
        });
        if (assigneeId) {
          await tx.insert(auditLogs).values({
            orgId,
            actorId: fallbackCreator,
            action: "ticket.updated",
            entityType: "ticket",
            entityId: ticket.id,
            metadata: { changes: { assigneeId: { from: null, to: assigneeId } } },
            createdAt: new Date(createdAt.getTime() + 0.1 * HOUR),
          });
        }

        for (const message of seed.thread) {
          const at = new Date(Math.min(now.getTime(), createdAt.getTime() + message.hoursAfter * HOUR));
          const fromStaff = message.from !== "customer";
          await tx.insert(ticketComments).values({
            orgId,
            ticketId: ticket.id,
            authorId: fromStaff ? staff[message.from as StaffKey] : null,
            authorName: fromStaff ? staffNames[message.from as StaffKey] : seed.requester[0],
            body: message.body,
            isInternal: message.internal ?? false,
            createdAt: at,
          });
          if (fromStaff) {
            await tx.insert(auditLogs).values({
              orgId,
              actorId: staff[message.from as StaffKey],
              action: message.internal ? "comment.internal_note" : "comment.created",
              entityType: "ticket",
              entityId: ticket.id,
              createdAt: at,
            });
          }
        }

        if (seed.status !== "open") {
          await tx.insert(auditLogs).values({
            orgId,
            actorId: assigneeId ?? fallbackCreator,
            action: "ticket.updated",
            entityType: "ticket",
            entityId: ticket.id,
            metadata: { changes: { status: { from: "open", to: seed.status } } },
            createdAt: updatedAt,
          });
        }
      }
    }

    await insertQueue(northwind.id, NORTHWIND_TICKETS, staff.adam, true);
    await insertQueue(globex.id, GLOBEX_TICKETS, userId(SECOND_ORG_ACCOUNT.email), false);

    return {
      northwind: { orgId: northwind.id, users: staff },
      globex: { orgId: globex.id, ownerId: userId(SECOND_ORG_ACCOUNT.email) },
    };
  });
}

