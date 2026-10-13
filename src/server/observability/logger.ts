import pino from "pino";
import { activeTraceContext } from "./tracer";

/**
 * Structured JSON logs. Each line carries service/env/version tags and, when
 * a Datadog span is active, `dd.trace_id` / `dd.span_id`, so Datadog links
 * the log line to its APM trace.
 */
const service = process.env.DD_SERVICE ?? "opsdesk-web";
const env = process.env.DD_ENV ?? process.env.NODE_ENV ?? "development";
const version = process.env.DD_VERSION ?? process.env.npm_package_version ?? "dev";

/** Builds the `dd` correlation object Datadog's log pipeline reads (`dd.trace_id`, `dd.span_id`, …). */
export function datadogLogContext(trace = activeTraceContext()) {
  return trace ? { dd: { trace_id: trace.trace_id, span_id: trace.span_id, service, env, version } } : {};
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service, env, version },
  messageKey: "message",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ status: label }),
  },
  mixin: () => datadogLogContext(),
  redact: {
    paths: ["password", "*.password", "authorization", "*.authorization", "cookie", "*.cookie", "token", "*.token"],
    censor: "[redacted]",
  },
});

export type Logger = typeof logger;
