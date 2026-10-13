import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatIssues } from "@/lib/validators/common";
import { AppError, RateLimitError, ValidationError } from "@/server/errors";

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Maps any thrown value to a JSON error response without leaking internals. */
export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof z.ZodError) {
    return errorResponse(new ValidationError("Validation failed", formatIssues(error)));
  }
  if (error instanceof AppError) {
    const response = NextResponse.json<ErrorBody>(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
    if (error instanceof RateLimitError) {
      response.headers.set("Retry-After", String(error.retryAfterSeconds));
    }
    return response;
  }
  return NextResponse.json<ErrorBody>(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500 },
  );
}

/** Parses and validates a JSON request body. */
export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

type RouteHandler<C> = (request: NextRequest, context: C) => Promise<Response>;

/**
 * Wraps a route handler with uniform error mapping. `name` identifies the
 * route in logs and metrics.
 */
export function withApi<C>(name: string, handler: RouteHandler<C>): RouteHandler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
