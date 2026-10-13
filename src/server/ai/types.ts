import type { AiTask, TicketPriority, TicketStatus } from "@/lib/domain";

/** Everything a provider needs to run one assist, already scoped to the caller's tenant. */
export interface AiTicketContext {
  orgName: string;
  agentName: string;
  ticket: {
    number: number;
    subject: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    requesterName: string;
    assigneeName: string | null;
    createdAt: Date;
  };
  thread: { authorName: string; fromCustomer: boolean; isInternal: boolean; body: string; createdAt: Date }[];
}

export interface AiRequest {
  task: AiTask;
  context: AiTicketContext;
}

export interface AiUsageReport {
  inputTokens: number;
  outputTokens: number;
}

export type AiStreamEvent = { type: "text"; text: string } | { type: "done"; usage: AiUsageReport };

/**
 * Minimal provider seam: the app depends on this, not on a vendor SDK, so the
 * model can be swapped (or mocked) without touching routes or UI.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  stream(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent>;
}
