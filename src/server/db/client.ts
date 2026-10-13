import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;
/** Driver-agnostic Drizzle handle: node-postgres in production, PGlite locally and in tests. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;
/** Either the root database or a transaction; services accept both. */
export type DbExecutor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute" | "transaction">;

export type DatabaseDriver = "postgres" | "pglite";

export interface DatabaseHandle {
  db: Database;
  driver: DatabaseDriver;
  close: () => Promise<void>;
}

export interface CreateDatabaseOptions {
  /** Postgres connection string. When omitted an embedded PGlite instance is used. */
  url?: string;
  /** PGlite data directory. Omit for a throwaway in-memory database (tests). */
  dataDir?: string;
  /** Apply pending SQL migrations from ./drizzle before returning. */
  migrate?: boolean;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export async function createDatabase(options: CreateDatabaseOptions = {}): Promise<DatabaseHandle> {
  if (options.url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: options.url, max: 10 });
    const db = drizzle(pool, { schema }) as unknown as Database;
    if (options.migrate) {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      await migrate(drizzle(pool, { schema }), { migrationsFolder: MIGRATIONS_FOLDER });
    }
    return { db, driver: "postgres", close: () => pool.end() };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = options.dataDir ? new PGlite(options.dataDir) : new PGlite();
  await client.waitReady;
  const pgliteDb = drizzle(client, { schema });
  if (options.migrate) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(pgliteDb, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  return { db: pgliteDb as unknown as Database, driver: "pglite", close: () => client.close() };
}

// Survive Next.js dev-server hot reloads: one connection pool / PGlite instance per process.
const globalForDb = globalThis as typeof globalThis & { __opsdeskDb?: Promise<DatabaseHandle> };

export function getDatabaseHandle(): Promise<DatabaseHandle> {
  globalForDb.__opsdeskDb ??= createDatabase(
    process.env.DATABASE_URL
      ? { url: process.env.DATABASE_URL }
      : // The embedded database migrates itself so `npm run dev` works with zero setup.
        { dataDir: process.env.PGLITE_DATA_DIR ?? ".pglite", migrate: true },
  );
  return globalForDb.__opsdeskDb;
}

export async function getDb(): Promise<Database> {
  return (await getDatabaseHandle()).db;
}
