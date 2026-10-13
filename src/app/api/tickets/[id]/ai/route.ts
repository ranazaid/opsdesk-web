import { aiAssistSchema } from "@/lib/validators/ai";
import { getAiProvider } from "@/server/ai";
import { prepareAiAssist, runAiAssist, toTextStream } from "@/server/ai/service";
import { getCurrentActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { UnauthorizedError } from "@/server/errors";
import { parseId, parseJson, withApi } from "@/server/http";
import { requirePermission } from "@/server/rbac";

/**
 * POST /api/tickets/:id/ai  { task: "summary" | "reply" }
 * Web-app endpoint (session cookie). Streams plain text as it is generated.
 */
export const POST = withApi("web.ai.assist", async (request, { params }: RouteContext<"/api/tickets/[id]/ai">) => {
  const actor = await getCurrentActor();
  if (!actor) throw new UnauthorizedError();
  requirePermission(actor, "ai:use");

  const { task } = await parseJson(request, aiAssistSchema);
  const db = await getDb();
  const provider = getAiProvider();
  const prepared = await prepareAiAssist(db, actor, parseId((await params).id), task);

  const body = toTextStream(runAiAssist(db, prepared, provider, { signal: request.signal }), (error) => {
    console.error("AI stream failed", error);
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-AI-Provider": provider.name,
      "X-AI-Model": provider.model,
      "X-AI-Quota-Remaining": String(Math.max(0, prepared.quota.limit - prepared.quota.used - 1)),
    },
  });
});
