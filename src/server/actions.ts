import { z } from "zod";
import { AppError } from "@/server/errors";

import type { ActionState } from "@/lib/action-state";

/**
 * Converts expected failures (validation, permission, plan limits) into a form
 * error. Anything else, including Next.js redirect/notFound signals, is rethrown.
 */
export function toActionError(error: unknown): ActionState {
  if (error instanceof z.ZodError) {
    return { status: "error", error: error.issues[0]?.message ?? "Please check the form and try again" };
  }
  if (error instanceof AppError) return { status: "error", error: error.message };
  throw error;
}
