import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isProduction } from "@/server/config";
import { getDb } from "@/server/db/client";
import { type Actor, loadActor } from "./actor";
import { SESSION_TTL_SECONDS, signToken, verifyToken } from "./tokens";

export const SESSION_COOKIE = "opsdesk_session";

/** Issues the web session: a signed JWT in an httpOnly, SameSite=Lax cookie. */
export async function startSession(actor: Pick<Actor, "userId" | "orgId">): Promise<void> {
  const token = await signToken(actor, "opsdesk:web", SESSION_TTL_SECONDS);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Resolves the signed-in actor once per request (memoised with React `cache`). */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const claims = await verifyToken(token, "opsdesk:web");
    return await loadActor(await getDb(), claims);
  } catch {
    return null;
  }
});

/** For pages and server actions: the actor, or a redirect to the login page. */
export async function requireActor(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  return actor;
}
