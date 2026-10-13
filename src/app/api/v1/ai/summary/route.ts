import { NextResponse } from "next/server";
import { apiAiSummarySchema } from "@/lib/validators/ai";
import { getAiProvider } from "@/server/ai";
import { generateAiAssist, prepareAiAssist, runAiAssist, toTextStream } from "@/server/ai/service";
import { apiContext } from "@/server/auth/bearer";
import { parseJson, withApi } from "@/server/http";
import { logger } from "@/server/observability/logger";

/**
 * POST /api/v1/ai/summary  { ticketId, task?: "summary" | "reply", stream?: boolean }
 * Returns JSON by default, or a streamed text body when `stream: true`.
 */
export const POST = withApi("v1.ai.summary", async (request) => {
  const { db, actor } = await apiContext(request);
  const input = await parseJson(request, apiAiSummarySchema);
  const provider = getAiProvider();
  const prepared = await prepareAiAssist(db, actor, input.ticketId, input.task);

  if (input.stream) {
    const body = toTextStream(runAiAssist(db, prepared, provider, { signal: request.signal }), (error) =>
      logger.error({ err: error, ticketId: prepared.ticketId }, "AI stream failed"),
    );
    return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const { text, result } = await generateAiAssist(db, prepared, provider);
  return NextResponse.json({ task: input.task, text, provider: provider.name, model: provider.model, usage: result?.usage });
});
