/**
 * Typed application errors. Route handlers and server actions translate these
 * into HTTP status codes / user-facing messages in one place (see http.ts).
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, 400, "bad_request", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "forbidden");
  }
}

/** Also used for cross-tenant access so the existence of other tenants' data never leaks. */
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "not_found");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "conflict");
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, 422, "validation_failed", details);
  }
}

/** A plan entitlement (seats, AI quota) has been exhausted. */
export class PlanLimitError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 402, "plan_limit_reached", details);
  }
}

export class RateLimitError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests, please slow down", 429, "rate_limited", { retryAfterSeconds });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
