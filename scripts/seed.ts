/**
 * Loads demo data (two organizations, a user per role, a realistic ticket
 * queue). Destructive: it truncates existing data first, so it refuses to run
 * with NODE_ENV=production. Stop `npm run dev` first when using PGlite, since
 * the embedded database allows one process at a time.
 */
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { createDatabase } from "@/server/db/client";
import { seedDemoData } from "@/server/db/seed";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production");
  }
  const url = process.env.DATABASE_URL;
  const handle = await createDatabase(
    url ? { url, migrate: true } : { dataDir: process.env.PGLITE_DATA_DIR ?? ".pglite", migrate: true },
  );
  await seedDemoData(handle.db);
  await handle.close();

  console.log(`Seeded demo data (${handle.driver}). Sign in with any of these (password: ${DEMO_PASSWORD}):`);
  for (const account of DEMO_ACCOUNTS) console.log(`  ${account.role.padEnd(7)} ${account.email}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
