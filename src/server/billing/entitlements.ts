import { and, count, eq, gte } from "drizzle-orm";
import type { Plan } from "@/lib/domain";
import { entitlementsFor } from "@/lib/plans";
import type { DbExecutor } from "@/server/db/client";
import { aiUsage, memberships, organizations } from "@/server/db/schema";
import { NotFoundError, PlanLimitError } from "@/server/errors";

/*
 * Plan entitlements are enforced on the server at the point of use (adding a
 * member, running an AI assist), always against the plan currently stored on
 * the organization, which only the Stripe webhook changes.
 */

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getOrgPlan(db: DbExecutor, orgId: string): Promise<Plan> {
  const [org] = await db.select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new NotFoundError("Organization not found");
  return org.plan;
}

export async function getUsage(db: DbExecutor, orgId: string, now = new Date()) {
  const [[seats], [ai]] = await Promise.all([
    db.select({ total: count() }).from(memberships).where(eq(memberships.orgId, orgId)),
    db
      .select({ total: count() })
      .from(aiUsage)
      .where(and(eq(aiUsage.orgId, orgId), gte(aiUsage.createdAt, startOfUtcMonth(now)))),
  ]);
  return { seatsUsed: seats?.total ?? 0, aiRequestsThisMonth: ai?.total ?? 0 };
}

export async function assertSeatAvailable(db: DbExecutor, orgId: string): Promise<void> {
  const plan = await getOrgPlan(db, orgId);
  const { seats } = entitlementsFor(plan);
  const { seatsUsed } = await getUsage(db, orgId);
  if (seatsUsed >= seats) {
    throw new PlanLimitError(`Your ${plan} plan includes ${seats} seats. Upgrade to add more members.`, {
      limit: seats,
      used: seatsUsed,
    });
  }
}

export async function assertAiQuota(db: DbExecutor, orgId: string, now = new Date()) {
  const plan = await getOrgPlan(db, orgId);
  const { aiRequestsPerMonth } = entitlementsFor(plan);
  const { aiRequestsThisMonth } = await getUsage(db, orgId, now);
  if (aiRequestsThisMonth >= aiRequestsPerMonth) {
    throw new PlanLimitError(
      `Your ${plan} plan includes ${aiRequestsPerMonth} AI assists per month, and they've all been used.`,
      { limit: aiRequestsPerMonth, used: aiRequestsThisMonth },
    );
  }
  return { plan, limit: aiRequestsPerMonth, used: aiRequestsThisMonth };
}
