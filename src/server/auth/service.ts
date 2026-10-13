import { eq } from "drizzle-orm";
import type { LoginInput } from "@/lib/validators/auth";
import type { DbExecutor } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { UnauthorizedError } from "@/server/errors";
import { type Actor, defaultOrgIdForUser, loadActor } from "./actor";
import { TIMING_SAFE_DUMMY_HASH, verifyPassword } from "./password";

const INVALID_CREDENTIALS = "Invalid email or password";

/** Verifies credentials and resolves the organization the session will act in. */
export async function authenticate(db: DbExecutor, input: LoginInput): Promise<Actor> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  // Always run bcrypt so unknown emails take as long as wrong passwords.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? TIMING_SAFE_DUMMY_HASH);
  if (!user || !passwordOk) throw new UnauthorizedError(INVALID_CREDENTIALS);

  const orgId = input.orgId ?? (await defaultOrgIdForUser(db, user.id));
  if (!orgId) throw new UnauthorizedError("This account is not a member of any organization");

  const actor = await loadActor(db, { userId: user.id, orgId });
  if (!actor) throw new UnauthorizedError(INVALID_CREDENTIALS);
  return actor;
}
