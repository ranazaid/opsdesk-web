import { and, desc, eq } from "drizzle-orm";
import type { Actor } from "@/server/auth/actor";
import type { DbExecutor } from "@/server/db/client";
import { auditLogs, users } from "@/server/db/schema";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Appends to the organization's audit log. Call inside the mutation's transaction. */
export async function recordAudit(
  db: DbExecutor,
  actor: Pick<Actor, "orgId" | "userId"> | { orgId: string; userId: null },
  entry: AuditEntry,
): Promise<void> {
  await db.insert(auditLogs).values({
    orgId: actor.orgId,
    actorId: actor.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  });
}

export async function listAuditLog(
  db: DbExecutor,
  orgId: string,
  options: { entityId?: string; limit?: number } = {},
) {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(
      options.entityId
        ? and(eq(auditLogs.orgId, orgId), eq(auditLogs.entityId, options.entityId))
        : eq(auditLogs.orgId, orgId),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(options.limit ?? 50);
}

export type AuditLogItem = Awaited<ReturnType<typeof listAuditLog>>[number];
