import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address"));

export const uuidSchema = z.uuid("Invalid id");

/** Flattens zod issues into a stable, client-friendly shape. */
export function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}
