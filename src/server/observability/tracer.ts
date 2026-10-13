import type { Tracer } from "dd-trace";

/**
 * Holds the dd-trace tracer once `instrumentation.ts` has initialised it.
 * Everything else (logger, metrics) degrades to a no-op when it's absent, so
 * local development and tests need no Datadog agent.
 */
const globalForTracer = globalThis as typeof globalThis & { __opsdeskTracer?: Tracer };

export function setTracer(tracer: Tracer): void {
  globalForTracer.__opsdeskTracer = tracer;
}

export function getTracer(): Tracer | undefined {
  return globalForTracer.__opsdeskTracer;
}

/** APM is enabled only when Datadog is configured for this environment. */
export function isDatadogEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DD_TRACE_ENABLED === "false") return false;
  return Boolean(env.DD_ENV || env.DD_API_KEY || env.DD_AGENT_HOST);
}

export interface TraceContext {
  trace_id: string;
  span_id: string;
}

/** Ids of the active span; logged under `dd.*`, the attributes Datadog uses to link logs and traces. */
export function activeTraceContext(): TraceContext | undefined {
  const span = getTracer()?.scope().active();
  if (!span) return undefined;
  const context = span.context();
  return { trace_id: context.toTraceId(), span_id: context.toSpanId() };
}
