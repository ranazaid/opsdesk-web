/**
 * Applies the committed SQL migrations in ./drizzle to DATABASE_URL, or to the
 * local PGlite database when DATABASE_URL is unset.
 */
import { createDatabase } from "@/server/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  const handle = await createDatabase(
    url ? { url, migrate: true } : { dataDir: process.env.PGLITE_DATA_DIR ?? ".pglite", migrate: true },
  );
  console.log(`Migrations applied (${handle.driver}).`);
  await handle.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
