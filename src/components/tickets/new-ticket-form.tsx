"use client";

import { useActionState } from "react";
import { createTicketAction } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { PRIORITY_LABELS, TICKET_PRIORITIES } from "@/lib/domain";
import { type ActionState, idleState } from "@/lib/action-state";

export function NewTicketForm({
  assignees,
  canAssign,
}: {
  assignees: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createTicketAction, idleState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="requesterName">Requester name</Label>
          <Input id="requesterName" name="requesterName" required maxLength={120} placeholder="Jane Cooper" />
        </div>
        <div>
          <Label htmlFor="requesterEmail">Requester email</Label>
          <Input id="requesterEmail" name="requesterEmail" type="email" required placeholder="jane@client.com" />
        </div>
      </div>
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required minLength={3} maxLength={200} placeholder="Short summary of the issue" />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" required rows={6} placeholder="What happened? Steps to reproduce, links, impact…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" name="priority" defaultValue="normal">
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="assigneeId">Assignee</Label>
          <Select id="assigneeId" name="assigneeId" defaultValue="" disabled={!canAssign}>
            <option value="">Unassigned</option>
            {assignees.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {state.status === "error" ? <FormError message={state.error} /> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create ticket"}
        </Button>
      </div>
    </form>
  );
}
