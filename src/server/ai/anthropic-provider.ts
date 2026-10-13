import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import type { AiProvider, AiRequest, AiStreamEvent } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/**
 * Claude via the official Anthropic TypeScript SDK, streamed token by token.
 * Server-side refusal fallbacks are enabled so a declined request is retried
 * on a fallback model within the same call.
 */
export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";

  constructor(
    private readonly client: Anthropic = new Anthropic(),
    readonly model: string = DEFAULT_ANTHROPIC_MODEL,
  ) {}

  async *stream(request: AiRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent> {
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 8192,
        // Summaries and short drafts don't need deep reasoning; low effort keeps latency down.
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: buildSystemPrompt(request),
        messages: [{ role: "user", content: buildUserPrompt(request) }],
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      yield { type: "text", text: "\n\n(The assistant couldn't help with this request.)" };
    }
    yield {
      type: "done",
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  }
}
