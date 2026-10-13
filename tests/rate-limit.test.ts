import { describe, expect, it } from "vitest";
import { RateLimitError } from "@/server/errors";
import { RateLimiter } from "@/server/rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit per window, then blocks with Retry-After", () => {
    let now = 1_000_000;
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect([1, 2, 3].map(() => limiter.check("user-1").allowed)).toEqual([true, true, true]);
    expect(limiter.check("user-1")).toMatchObject({ allowed: false, remaining: 0 });

    now += 15_000;
    try {
      limiter.enforce("user-1");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfterSeconds).toBe(45);
    }
  });

  it("tracks keys independently and resets after the window", () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    now = 1_000;
    expect(limiter.check("a").allowed).toBe(true);
  });
});
