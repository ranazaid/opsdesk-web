import { getTracer } from "./tracer";

export type MetricTags = Record<string, string | number>;

export interface MetricsSink {
  increment(name: string, value: number, tags: MetricTags): void;
  histogram(name: string, value: number, tags: MetricTags): void;
}

/** Sends custom metrics through dd-trace's DogStatsD client when APM is running. */
const dogStatsdSink: MetricsSink = {
  increment: (name, value, tags) => getTracer()?.dogstatsd.increment(name, value, tags),
  histogram: (name, value, tags) => getTracer()?.dogstatsd.histogram(name, value, tags),
};

let sink: MetricsSink = dogStatsdSink;

/** Swap the sink (tests use an in-memory recorder). */
export function setMetricsSink(next: MetricsSink | null): void {
  sink = next ?? dogStatsdSink;
}

const PREFIX = "opsdesk.";

export const metrics = {
  increment(name: string, tags: MetricTags = {}, value = 1) {
    sink.increment(PREFIX + name, value, tags);
  },
  histogram(name: string, value: number, tags: MetricTags = {}) {
    sink.histogram(PREFIX + name, value, tags);
  },
};

/*
 * Business metrics. Names are referenced by observability/datadog-dashboard.json
 * and the monitors in observability/monitors/, so keep them in sync.
 */
export const track = {
  ticketCreated: (tags: { plan: string; priority: string; channel: "web" | "api" }) => metrics.increment("tickets.created", tags),
  aiRequest: (tags: { task: string; provider: string; model: string; outcome: "success" | "error" }) =>
    metrics.increment("ai.requests", tags),
  aiLatency: (ms: number, tags: { task: string; provider: string; model: string }) => metrics.histogram("ai.latency_ms", ms, tags),
  aiTokens: (count: number, tags: { direction: "input" | "output"; provider: string; model: string }) =>
    metrics.increment("ai.tokens", tags, count),
  apiRequest: (ms: number, tags: { route: string; method: string; status: number }) => {
    const statusClass = `${Math.floor(tags.status / 100)}xx`;
    metrics.increment("api.requests", { ...tags, status_class: statusClass });
    metrics.histogram("api.latency_ms", ms, { route: tags.route, method: tags.method, status_class: statusClass });
  },
  webhook: (outcome: "processed" | "duplicate" | "ignored" | "failed", eventType: string) =>
    metrics.increment(outcome === "failed" ? "stripe.webhook.failed" : "stripe.webhook.received", {
      outcome,
      event_type: eventType,
    }),
  login: (outcome: "success" | "failure" | "rate_limited", channel: "web" | "api") =>
    metrics.increment("auth.login", { outcome, channel }),
};
