import { RateLimitError } from "@/server/errors";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window, in-memory rate limiter keyed per user / IP. Good enough for a
 * single instance; a multi-instance deployment would back this with Redis
 * (same interface, INCR + EXPIRE).
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly options: { limit: number; windowMs: number; now?: () => number },
  ) {}

  check(key: string): RateLimitResult {
    const now = this.options.now?.() ?? Date.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.options.windowMs };
      this.windows.set(key, window);
      this.sweep(now);
    }
    window.count += 1;
    const allowed = window.count <= this.options.limit;
    return { allowed, remaining: Math.max(0, this.options.limit - window.count), resetAt: window.resetAt };
  }

  /** Throws a RateLimitError (HTTP 429) when the key is over its limit. */
  enforce(key: string): RateLimitResult {
    const result = this.check(key);
    if (!result.allowed) {
      const now = this.options.now?.() ?? Date.now();
      throw new RateLimitError(Math.max(1, Math.ceil((result.resetAt - now) / 1000)));
    }
    return result;
  }

  reset(): void {
    this.windows.clear();
  }

  private sweep(now: number) {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}

const globalForLimits = globalThis as typeof globalThis & {
  __opsdeskLimiters?: { login: RateLimiter; ai: RateLimiter };
};

/** Shared limiters (kept on globalThis so dev hot reloads don't reset them). */
export const rateLimiters = (globalForLimits.__opsdeskLimiters ??= {
  /** Per email + IP: 10 attempts per 5 minutes. */
  login: new RateLimiter({ limit: 10, windowMs: 5 * 60_000 }),
  /** Per user: 10 AI generations per minute (the monthly plan quota is separate). */
  ai: new RateLimiter({ limit: 10, windowMs: 60_000 }),
});
