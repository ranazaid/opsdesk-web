import type { Instrumentation } from "next";

/**
 * Next.js calls `register` once per server instance, before any request.
 * Datadog APM is initialised only when DD_* configuration is present, and
 * only in the Node.js runtime (dd-trace doesn't run on the Edge runtime).
 *
 * In production, start with `npm run start:datadog`, which preloads dd-trace
 * through NODE_OPTIONS so even the `next` integration is patched. `init()` is
 * idempotent, so this function then just picks up the running tracer; without
 * the preload it still traces pg/http and custom spans.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { isDatadogEnabled, setTracer } = await import("@/server/observability/tracer");
  if (!isDatadogEnabled()) return;

  const { default: tracer } = await import("dd-trace");
  tracer.init({
    service: process.env.DD_SERVICE ?? "opsdesk-web",
    env: process.env.DD_ENV,
    version: process.env.DD_VERSION ?? process.env.npm_package_version,
    // Correlation ids are added by our pino mixin (see logger.ts) for explicit, testable output.
    logInjection: false,
    runtimeMetrics: true,
    profiling: process.env.DD_PROFILING_ENABLED === "true",
  });
  tracer.use("next");
  tracer.use("pg");
  tracer.use("http");
  setTracer(tracer);

  const { logger } = await import("@/server/observability/logger");
  logger.info({ ddEnv: process.env.DD_ENV }, "Datadog APM initialised");
}

/** Unhandled errors from server components, route handlers and server actions. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("@/server/observability/logger");
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(
    {
      err,
      digest: (error as { digest?: string }).digest,
      http: { method: request.method, url_details: { path: request.path } },
      next: { routerKind: context.routerKind, routePath: context.routePath, routeType: context.routeType },
    },
    "Unhandled request error",
  );
};
