import { z } from "zod";
import { AI_TASKS } from "@/lib/domain";
import { uuidSchema } from "./common";

export const aiAssistSchema = z.object({ task: z.enum(AI_TASKS).default("summary") });

/** POST /api/v1/ai/summary (mobile app). */
export const apiAiSummarySchema = z.object({
  ticketId: uuidSchema,
  task: z.enum(AI_TASKS).default("summary"),
  stream: z.boolean().default(false),
});
