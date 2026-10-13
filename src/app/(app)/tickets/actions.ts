"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCommentSchema, createTicketSchema, updateTicketSchema } from "@/lib/validators/tickets";
import type { ActionState } from "@/lib/action-state";
import { toActionError } from "@/server/actions";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { addComment, createTicket, updateTicket } from "@/server/tickets/service";

export async function createTicketAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let ticketId: string;
  try {
    const input = createTicketSchema.parse(Object.fromEntries(formData));
    ticketId = (await createTicket(await getDb(), actor, input)).id;
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath("/tickets");
  redirect(`/tickets/${ticketId}`);
}

export async function updateTicketAction(
  ticketId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = updateTicketSchema.parse(Object.fromEntries(formData));
    await updateTicket(await getDb(), actor, ticketId, input);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath(`/tickets/${ticketId}`);
  return { status: "success", message: "Ticket updated" };
}

export async function addCommentAction(
  ticketId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  try {
    const input = createCommentSchema.parse({ body: formData.get("body"), isInternal: formData.get("isInternal") });
    await addComment(await getDb(), actor, ticketId, input);
  } catch (error) {
    return toActionError(error);
  }
  revalidatePath(`/tickets/${ticketId}`);
  return { status: "success", message: "Reply added" };
}
