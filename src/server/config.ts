/**
 * Server configuration read lazily from the environment, so `next build` never
 * needs runtime secrets. See .env.example for documentation of every variable.
 */

const DEV_AUTH_SECRET = "opsdesk-dev-secret-change-me-0123456789abcdef";

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set to at least 32 characters in production");
  }
  return new TextEncoder().encode(DEV_AUTH_SECRET);
}

export function getAppUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
