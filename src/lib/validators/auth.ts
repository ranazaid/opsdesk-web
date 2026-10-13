import { z } from "zod";
import { emailSchema, uuidSchema } from "./common";

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(200),
  /** Optional: pick an organization when the user belongs to several. */
  orgId: uuidSchema.optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
