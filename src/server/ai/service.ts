import type { AiTask } from "@/lib/domain";
import { recordAudit } from "@/server/audit";
import type { Actor } from "@/server/auth/actor";
import { assertAiQuota } from "@/server/billing/entitlements";
import type { Database } from "@/server/db/client";
import { aiUsage } from "@/server/db/schema";
import { rateLimiters } from "@/server/rate-limit";
import { requirePermission } from "@/server/rbac";
import { getTicket, listComments } from "@/server/tickets/service";
import type { AiProvider, AiRequest, AiUsageReport } from "./types";

export interface PreparedAiAssist {
  actor: Actor;
  ticketId: string;
  request: AiRequest;
  quota: { limit: number; used: number };
}

/**
 * Runs every check that can fail *before* streaming starts, so the route can
 * still answer with a proper status code: permission, per-user rate limit,
 * the plan's monthly AI quota, and tenant-scoped ticket access.
 */
export async function prepareAiAssist(
  db: Database,
  actor: Actor,
  ticketId: string,
  task: AiTask,
): Promise<PreparedAiAssist> {
  requirePermission(actor, "ai:use");
  rateLimiters.ai.enforce(`ai:${actor.userId}`);
  const quota = await assertAiQuota(db, actor.orgId);

  const ticket = await getTicket(db, actor, ticketId);
  const comments = await listComments(db, actor, ticketId);

  return {
    actor,
    ticketId,
    quota: { limit: quota.limit, used: quota.used },
    request: {
      task,
      context: {
        orgName: actor.orgName,
        agentName: actor.name,
        ticket: {
          number: ticket.number,
          subject: ticket.subject,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          requesterName: ticket.requesterName,
          assigneeName: ticket.assigneeName,
          createdAt: new Date(ticket.createdAt),
        },
        thread: comments.map((c) => ({
          authorName: c.authorName,
          fromCustomer: c.authorId === null,
          isInternal: c.isInternal,
          body: c.body,
          createdAt: new Date(c.createdAt),
        })),
      },
    },
  };
}

export interface AiAssistResult {
  provider: string;
  model: string;
  latencyMs: number;
  usage: AiUsageReport;
}

/**
 * Streams the provider's text, then records usage (for quotas and cost
 * tracking) and an audit entry once the generation completes.
 */
export async function* runAiAssist(
  db: Database,
  prepared: PreparedAiAssist,
  provider: AiProvider,
  options: { signal?: AbortSignal; onComplete?: (result: AiAssistResult) => void } = {},
): AsyncGenerator<string, AiAssistResult | null> {
  const started = performance.now();
  let usage: AiUsageReport | null = null;

  for await (const event of provider.stream(prepared.request, options.signal)) {
    if (event.type === "text") yield event.text;
    else usage = event.usage;
  }
  if (!usage) return null; // aborted before completion: nothing is billed against the quota

  const result: AiAssistResult = {
    provider: provider.name,
    model: provider.model,
    latencyMs: Math.round(performance.now() - started),
    usage,
  };
  const { actor, ticketId, request } = prepared;
  await db.transaction(async (tx) => {
    await tx.insert(aiUsage).values({
      orgId: actor.orgId,
      userId: actor.userId,
      ticketId,
      task: request.task,
      provider: result.provider,
      model: result.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs: result.latencyMs,
    });
    await recordAudit(tx, actor, {
      action: `ai.${request.task}`,
      entityType: "ticket",
      entityId: ticketId,
      metadata: { provider: result.provider, model: result.model, latencyMs: result.latencyMs },
    });
  });
  options.onComplete?.(result);
  return result;
}

/** Non-streaming variant for API clients that want a single JSON response. */
export async function generateAiAssist(db: Database, prepared: PreparedAiAssist, provider: AiProvider) {
  const iterator = runAiAssist(db, prepared, provider);
  let text = "";
  for (;;) {
    const step = await iterator.next();
    if (step.done) return { text, result: step.value };
    text += step.value;
  }
}

/** Wraps the generator as a streamed HTTP body (UTF-8 text chunks). */
export function toTextStream(chunks: AsyncGenerator<string, unknown>, onError: (error: unknown) => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const step = await chunks.next();
        if (step.done) controller.close();
        else controller.enqueue(encoder.encode(step.value));
      } catch (error) {
        onError(error);
        controller.enqueue(encoder.encode("\n\n[AI assist is temporarily unavailable. Please try again.]"));
        controller.close();
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
