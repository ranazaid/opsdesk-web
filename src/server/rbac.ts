import { can, type Permission } from "@/lib/permissions";
import type { Actor } from "@/server/auth/actor";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

/**
 * Authorization guard used by every server action, route handler and service
 * mutation. Throws 401 for anonymous callers and 403 when the actor's role
 * lacks the permission.
 */
export function requirePermission(actor: Actor | null | undefined, permission: Permission): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError();
  if (!can(actor.role, permission)) {
    throw new ForbiddenError(`Your role (${actor.role}) does not allow ${permission}`);
  }
}
