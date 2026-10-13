import { AnthropicAiProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic-provider";
import { MockAiProvider } from "./mock-provider";
import type { AiProvider } from "./types";

let provider: AiProvider | null = null;

/** Real Claude when ANTHROPIC_API_KEY is set, otherwise the deterministic offline mock. */
export function getAiProvider(): AiProvider {
  provider ??= process.env.ANTHROPIC_API_KEY
    ? new AnthropicAiProvider(undefined, process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL)
    : new MockAiProvider({ chunkDelayMs: process.env.NODE_ENV === "test" ? 0 : 18 });
  return provider;
}

export type { AiProvider } from "./types";
