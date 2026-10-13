import { and, eq } from "drizzle-orm";
import type { RegisterPushTokenInput } from "@/lib/validators/devices";
import type { Actor } from "@/server/auth/actor";
import type { DbExecutor } from "@/server/db/client";
import { pushTokens } from "@/server/db/schema";
import { UnauthorizedError } from "@/server/errors";

/**
 * Registers (or re-registers) the caller's device for push notifications.
 * Any member may register, including viewers: notifications are read-only.
 *
 * Idempotent upsert on the token: repeated launches only bump `lastSeenAt`,
 * and a token that was registered by another account (shared device, account
 * switch) is moved to the caller so the previous user stops receiving pushes.
 */
export async function registerPushToken(db: DbExecutor, actor: Actor | null | undefined, input: RegisterPushTokenInput) {
  if (!actor) throw new UnauthorizedError();
  const now = new Date();
  const [row] = await db
    .insert(pushTokens)
    .values({ orgId: actor.orgId, userId: actor.userId, token: input.token, platform: input.platform, lastSeenAt: now })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { orgId: actor.orgId, userId: actor.userId, platform: input.platform, lastSeenAt: now },
    })
    .returning();
  if (!row) throw new Error("Push token upsert returned no row");
  return row;
}

/** Tokens to notify for one member of one organization (used by the sender). */
export async function listPushTokens(db: DbExecutor, orgId: string, userId: string) {
  return db
    .select({ token: pushTokens.token, platform: pushTokens.platform, lastSeenAt: pushTokens.lastSeenAt })
    .from(pushTokens)
    .where(and(eq(pushTokens.orgId, orgId), eq(pushTokens.userId, userId)));
}
