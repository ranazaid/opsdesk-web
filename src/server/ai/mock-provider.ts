import { buildSystemPrompt, buildUserPrompt, estimateTokens } from "./prompts";
import type { AiProvider, AiRequest, AiStreamEvent, AiTicketContext } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function firstSentence(text: string, max = 160): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

function nextStep({ ticket, thread }: AiTicketContext): string {
  const last = thread.at(-1);
  if (ticket.status === "resolved" || ticket.status === "closed") return "Confirm the fix with the customer and close out any follow-ups.";
  if (!ticket.assigneeName) return "Assign an owner and send the customer a first response.";
  if (last?.fromCustomer) return `Reply to ${ticket.requesterName}'s latest message with a status update.`;
  if (ticket.status === "pending") return `Wait for ${ticket.requesterName} to confirm, then follow up within one business day.`;
  if (ticket.priority === "urgent") return "Keep the customer updated hourly until the fix is deployed.";
  return "Continue the investigation and update the customer once there is progress.";
}

export function mockSummary(context: AiTicketContext): string {
  const { ticket, thread } = context;
  const customer = thread.filter((m) => m.fromCustomer).length;
  const internal = thread.filter((m) => m.isInternal).length;
  const team = thread.length - customer - internal;
  const last = thread.at(-1);

  const lines = [
    `${ticket.requesterName} reported: ${firstSentence(ticket.description)} The ticket is ${ticket.status} with ${ticket.priority} priority and is ${ticket.assigneeName ? `assigned to ${ticket.assigneeName}` : "not assigned yet"}.`,
    "",
    "Key facts:",
    `• ${thread.length} message${thread.length === 1 ? "" : "s"} so far: ${customer} from the customer, ${team} from the team, ${internal} internal note${internal === 1 ? "" : "s"}.`,
  ];
  if (last) lines.push(`• Latest from ${last.authorName}: "${firstSentence(last.body, 120)}"`);
  lines.push(`• Opened ${ticket.createdAt.toISOString().slice(0, 10)} as #${ticket.number}.`, "", `Next step: ${nextStep(context)}`);
  return lines.join("\n");
}

export function mockReply(context: AiTicketContext): string {
  const { ticket, agentName, orgName } = context;
  const firstName = ticket.requesterName.split(" ")[0] ?? ticket.requesterName;
  const statusLine: Record<typeof ticket.status, string> = {
    open: "I'm actively working on this and will keep you posted as soon as I have an update.",
    pending: "We've made progress on our side and are waiting on a quick confirmation from you before we wrap this up.",
    resolved: "This should now be resolved. Please let me know if you still see any issues.",
    closed: "This ticket is closed, but I'm happy to reopen it if anything comes up again.",
  };
  return [
    `Hi ${firstName},`,
    "",
    `Thanks for getting in touch about "${ticket.subject}". ${statusLine[ticket.status]}`,
    "",
    ticket.priority === "urgent" || ticket.priority === "high"
      ? "I know this is time-sensitive, so it's at the top of our queue."
      : "Thanks for your patience while we look into it.",
    "",
    "Best regards,",
    `${agentName}`,
    orgName,
  ].join("\n");
}

/**
 * Deterministic offline provider: same ticket in, same text out. Used when
 * ANTHROPIC_API_KEY is unset so the app, demo and tests run without network.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "opsdesk-mock-1";

  constructor(private readonly options: { chunkDelayMs?: number } = {}) {}

  async *stream(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent> {
    const text = request.task === "summary" ? mockSummary(request.context) : mockReply(request.context);
    const delay = this.options.chunkDelayMs ?? 0;
    for (const chunk of text.match(/\S+\s*|\s+/g) ?? []) {
      if (signal?.aborted) return;
      if (delay > 0) await sleep(delay);
      yield { type: "text", text: chunk };
    }
    yield {
      type: "done",
      usage: {
        inputTokens: estimateTokens(buildSystemPrompt(request) + buildUserPrompt(request)),
        outputTokens: estimateTokens(text),
      },
    };
  }
}
