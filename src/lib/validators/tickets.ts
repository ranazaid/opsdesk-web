import { z } from "zod";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/domain";
import { emailSchema, uuidSchema } from "./common";

const subject = z.string().trim().min(3, "Subject must be at least 3 characters").max(200);
const body = z.string().trim().min(1, "Message cannot be empty").max(10_000);

/** Empty strings from HTML forms mean "not provided". */
const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const createTicketSchema = z.object({
  subject,
  description: body,
  requesterName: z.string().trim().min(1, "Requester name is required").max(120),
  requesterEmail: emailSchema,
  priority: z.enum(TICKET_PRIORITIES).default("normal"),
  assigneeId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z
  .object({
    subject: subject.optional(),
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    /** `null` unassigns the ticket. */
    assigneeId: z.preprocess((v) => (v === "" ? null : v), uuidSchema.nullable().optional()),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createCommentSchema = z.object({
  body,
  isInternal: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(false),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/** Query-string filters for ticket lists (web table and REST API). */
export const ticketFiltersSchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum([...TICKET_STATUSES, "active"]).optional()),
  priority: z.preprocess(emptyToUndefined, z.enum(TICKET_PRIORITIES).optional()),
  /** A member id, "me" or "unassigned". */
  assignee: z.preprocess(emptyToUndefined, z.union([z.literal("me"), z.literal("unassigned"), uuidSchema]).optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type TicketFilters = z.infer<typeof ticketFiltersSchema>;
