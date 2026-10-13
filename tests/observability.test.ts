import { describe, expect, it } from "vitest";
import { datadogLogContext } from "@/server/observability/logger";
import { metrics, setMetricsSink, track } from "@/server/observability/metrics";
import { isDatadogEnabled } from "@/server/observability/tracer";

describe("observability", () => {
  it("enables Datadog APM only when DD configuration is present", () => {
    expect(isDatadogEnabled({})).toBe(false);
    expect(isDatadogEnabled({ DD_ENV: "production" })).toBe(true);
    expect(isDatadogEnabled({ DD_AGENT_HOST: "datadog-agent" })).toBe(true);
    expect(isDatadogEnabled({ DD_ENV: "production", DD_TRACE_ENABLED: "false" })).toBe(false);
  });

  it("adds dd.trace_id / dd.span_id to log lines when a span is active", () => {
    expect(datadogLogContext(undefined)).toEqual({});
    expect(datadogLogContext({ trace_id: "123", span_id: "456" })).toMatchObject({
      dd: { trace_id: "123", span_id: "456", service: "opsdesk-web" },
    });
  });

  it("prefixes metric names and tags API requests by status class", () => {
    const seen: { name: string; value: number; tags: Record<string, string | number> }[] = [];
    setMetricsSink({
      increment: (name, value, tags) => seen.push({ name, value, tags }),
      histogram: (name, value, tags) => seen.push({ name, value, tags }),
    });
    try {
      metrics.increment("tickets.created", { channel: "web" });
      track.apiRequest(42, { route: "v1.tickets.list", method: "GET", status: 503 });
      track.webhook("failed", "unknown");
    } finally {
      setMetricsSink(null);
    }
    expect(seen).toEqual([
      { name: "opsdesk.tickets.created", value: 1, tags: { channel: "web" } },
      { name: "opsdesk.api.requests", value: 1, tags: { route: "v1.tickets.list", method: "GET", status: 503, status_class: "5xx" } },
      { name: "opsdesk.api.latency_ms", value: 42, tags: { route: "v1.tickets.list", method: "GET", status_class: "5xx" } },
      { name: "opsdesk.stripe.webhook.failed", value: 1, tags: { outcome: "failed", event_type: "unknown" } },
    ]);
  });
});
