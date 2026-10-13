import { afterEach } from "vitest";
import { rateLimiters } from "@/server/rate-limit";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123456789";

afterEach(() => {
  rateLimiters.login.reset();
  rateLimiters.ai.reset();
});
