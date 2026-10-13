import { z } from "zod";
import { ROLES } from "@/lib/domain";
import { emailSchema } from "./common";

export const addMemberSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Name is required").max(120),
  role: z.enum(ROLES),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const changeRoleSchema = z.object({ role: z.enum(ROLES) });
