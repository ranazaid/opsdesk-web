import { and, asc, eq } from "drizzle-orm";
import type { Plan, Role } from "@/lib/domain";
import type { DbExecutor } from "@/server/db/client";
import { memberships, organizations, users } from "@/server/db/schema";

/**
 * The authenticated principal for a request: a user acting inside one
 * organization. The role is always read from the database, never trusted from
 * a token, so role changes and removals take effect immediately.
 */
export interface Actor {
  userId: string;
  orgId: string;
  role: Role;
  email: string;
  name: string;
  orgName: string;
  plan: Plan;
}

export async function loadActor(
  db: DbExecutor,
  { userId, orgId }: { userId: string; orgId: string },
): Promise<Actor | null> {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      orgId: organizations.id,
      orgName: organizations.name,
      plan: organizations.plan,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

/** The organization a user lands in when none is specified: their oldest membership. */
export async function defaultOrgIdForUser(db: DbExecutor, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ orgId: memberships.orgId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  return row?.orgId ?? null;
}
