import type { Role } from "./domain";

/**
 * Seeded demo users (see scripts/seed.ts). These only exist in a local demo
 * database; the shared password is intentionally public.
 */
export const DEMO_PASSWORD = "opsdesk-demo";

export const DEMO_ORG = { name: "Northwind Agency", slug: "northwind" } as const;
export const SECOND_DEMO_ORG = { name: "Globex Studio", slug: "globex" } as const;

export const DEMO_ACCOUNTS: { email: string; name: string; role: Role }[] = [
  { email: "olivia@northwind.test", name: "Olivia Bennett", role: "owner" },
  { email: "adam@northwind.test", name: "Adam Clarke", role: "admin" },
  { email: "aisha@northwind.test", name: "Aisha Khan", role: "agent" },
  { email: "marco@northwind.test", name: "Marco Rossi", role: "agent" },
  { email: "victor@northwind.test", name: "Victor Hughes", role: "viewer" },
];

export const SECOND_ORG_ACCOUNT = { email: "gina@globex.test", name: "Gina Patel", role: "owner" as Role };
