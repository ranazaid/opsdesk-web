import { loadActor, type Actor } from "@/server/auth/actor";
import { createDatabase, type Database, type DatabaseHandle } from "@/server/db/client";
import { type SeedResult, seedDemoData } from "@/server/db/seed";

export interface TestDb {
  handle: DatabaseHandle;
  db: Database;
  seed: SeedResult;
  actor: (userId: string, orgId?: string) => Promise<Actor>;
}

/** A fresh in-memory PGlite database with migrations applied and demo data loaded. */
export async function createTestDb(): Promise<TestDb> {
  const handle = await createDatabase({ migrate: true });
  const seed = await seedDemoData(handle.db, { passwordRounds: 4 });
  return {
    handle,
    db: handle.db,
    seed,
    actor: async (userId, orgId = seed.northwind.orgId) => {
      const actor = await loadActor(handle.db, { userId, orgId });
      if (!actor) throw new Error(`No membership for ${userId} in ${orgId}`);
      return actor;
    },
  };
}
