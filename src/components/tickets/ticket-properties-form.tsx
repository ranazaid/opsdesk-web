"use client";

import { useActionState } from "react";
import { updateTicketAction } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import { FormError, Label, Select } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-state";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/domain";

interface Props {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  assignees: { id: string; name: string }[];
  canUpdate: boolean;
  canAssign: boolean;
}

export function TicketPropertiesForm({ ticketId, status, priority, assigneeId, assignees, canUpdate, canAssign }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateTicketAction.bind(null, ticketId),
    idleState,
  );

  return (
    <form action={formAction} className="space-y-3 p-5">
      <div>
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={status} disabled={!canUpdate}>
          {TICKET_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="priority">Priority</Label>
        <Select id="priority" name="priority" defaultValue={priority} disabled={!canUpdate}>
          {TICKET_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="assigneeId">Assignee</Label>
        <Select id="assigneeId" name="assigneeId" defaultValue={assigneeId ?? ""} disabled={!canAssign}>
          <option value="">Unassigned</option>
          {assignees.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </div>
      {state.status === "error" ? <FormError message={state.error} /> : null}
      {canUpdate ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-emerald-600" aria-live="polite">
            {state.status === "success" && !pending ? state.message : ""}
          </span>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Your role has read-only access to tickets.</p>
      )}
    </form>
  );
}
