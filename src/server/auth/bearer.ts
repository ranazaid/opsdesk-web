import { type DbExecutor, getDb } from "@/server/db/client";
import { UnauthorizedError } from "@/server/errors";
import { type Actor, loadActor } from "./actor";
import { verifyToken } from "./tokens";

const BEARER = /^Bearer\s+(?<token>[A-Za-z0-9\-_.]+)$/i;

/** Authenticates a REST API request (`Authorization: Bearer <jwt>`). */
export async function authenticateBearer(db: DbExecutor, request: Request): Promise<Actor> {
  const match = BEARER.exec(request.headers.get("authorization") ?? "");
  const token = match?.groups?.token;
  if (!token) throw new UnauthorizedError("Missing bearer token");

  const claims = await verifyToken(token, "opsdesk:api");
  const actor = await loadActor(db, claims);
  if (!actor) throw new UnauthorizedError("Membership no longer active");
  return actor;
}

/** Database handle + authenticated actor for a REST API route. */
export async function apiContext(request: Request) {
  const db = await getDb();
  return { db, actor: await authenticateBearer(db, request) };
}
