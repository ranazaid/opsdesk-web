import { randomBytes } from "node:crypto";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Role } from "@/lib/domain";
import { canAssignRole } from "@/lib/permissions";
import type { AddMemberInput } from "@/lib/validators/team";
import { recordAudit } from "@/server/audit";
import type { Actor } from "@/server/auth/actor";
import { hashPassword } from "@/server/auth/password";
import { assertSeatAvailable } from "@/server/billing/entitlements";
import type { DbExecutor } from "@/server/db/client";
import { memberships, organizations, tickets, users } from "@/server/db/schema";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { requirePermission } from "@/server/rbac";

export async function listMembers(db: DbExecutor, actor: Actor) {
  requirePermission(actor, "member:read");
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, actor.orgId))
    .orderBy(asc(memberships.createdAt));
}

export type TeamMember = Awaited<ReturnType<typeof listMembers>>[number];

async function getMembership(db: DbExecutor, orgId: string, userId: string) {
  const [member] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  if (!member) throw new NotFoundError("Member not found");
  return member;
}

async function assertNotLastOwner(db: DbExecutor, orgId: string) {
  const [owners] = await db
    .select({ total: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
  if ((owners?.total ?? 0) <= 1) throw new ConflictError("An organization must keep at least one owner");
}

/**
 * Adds a member, enforcing the plan's seat limit. New users get a one-time
 * temporary password (an email invitation flow would replace this in
 * production); existing users are simply added to the organization.
 */
export async function addMember(
  db: DbExecutor,
  actor: Actor,
  input: AddMemberInput,
): Promise<{ userId: string; temporaryPassword: string | null }> {
  requirePermission(actor, "member:invite");
  if (!canAssignRole(actor.role, "viewer", input.role)) {
    throw new ForbiddenError(`Your role cannot add ${input.role}s`);
  }

  return db.transaction(async (tx) => {
    // Lock the organization row so concurrent invites can't both take the last seat.
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, actor.orgId)).for("update");
    await assertSeatAvailable(tx, actor.orgId);

    let [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    let temporaryPassword: string | null = null;
    if (!user) {
      temporaryPassword = randomBytes(12).toString("base64url");
      [user] = await tx
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash: await hashPassword(temporaryPassword) })
        .returning({ id: users.id });
      if (!user) throw new Error("User insert returned no row");
    }

    const added = await tx
      .insert(memberships)
      .values({ orgId: actor.orgId, userId: user.id, role: input.role })
      .onConflictDoNothing()
      .returning({ id: memberships.id });
    if (added.length === 0) throw new ConflictError(`${input.email} is already a member`);

    await recordAudit(tx, actor, {
      action: "member.added",
      entityType: "member",
      entityId: user.id,
      metadata: { email: input.email, role: input.role },
    });
    return { userId: user.id, temporaryPassword };
  });
}

export async function changeMemberRole(db: DbExecutor, actor: Actor, userId: string, role: Role): Promise<void> {
  requirePermission(actor, "member:update_role");
  const target = await getMembership(db, actor.orgId, userId);
  if (target.role === role) return;
  if (!canAssignRole(actor.role, target.role, role)) {
    throw new ForbiddenError(`Your role cannot change a ${target.role} to ${role}`);
  }

  await db.transaction(async (tx) => {
    if (target.role === "owner") await assertNotLastOwner(tx, actor.orgId);
    await tx
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.orgId, actor.orgId), eq(memberships.userId, userId)));
    await recordAudit(tx, actor, {
      action: "member.role_changed",
      entityType: "member",
      entityId: userId,
      metadata: { from: target.role, to: role },
    });
  });
}

export async function removeMember(db: DbExecutor, actor: Actor, userId: string): Promise<void> {
  requirePermission(actor, "member:remove");
  if (userId === actor.userId) throw new ConflictError("You can't remove yourself");
  const target = await getMembership(db, actor.orgId, userId);
  if (!canAssignRole(actor.role, target.role, target.role)) {
    throw new ForbiddenError(`Your role cannot remove a ${target.role}`);
  }

  await db.transaction(async (tx) => {
    if (target.role === "owner") await assertNotLastOwner(tx, actor.orgId);
    await tx.delete(memberships).where(and(eq(memberships.orgId, actor.orgId), eq(memberships.userId, userId)));
    // Return their unresolved work to the queue.
    await tx
      .update(tickets)
      .set({ assigneeId: null })
      .where(
        and(
          eq(tickets.orgId, actor.orgId),
          eq(tickets.assigneeId, userId),
          inArray(tickets.status, ["open", "pending"]),
        ),
      );
    await recordAudit(tx, actor, { action: "member.removed", entityType: "member", entityId: userId, metadata: { role: target.role } });
  });
}
