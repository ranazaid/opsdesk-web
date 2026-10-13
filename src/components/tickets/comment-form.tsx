"use client";

import { useActionState } from "react";
import { addCommentAction } from "@/app/(app)/tickets/actions";
import { Button } from "@/components/ui/button";
import { FormError, Textarea } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-state";

export function CommentForm({ ticketId, canWriteInternal }: { ticketId: string; canWriteInternal: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addCommentAction.bind(null, ticketId),
    idleState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <Textarea
        id="reply-body"
        name="body"
        rows={4}
        required
        placeholder="Write a reply to the customer…"
        aria-label="Reply"
      />
      {state.status === "error" ? <FormError message={state.error} /> : null}
      <div className="flex items-center justify-between gap-3">
        {canWriteInternal ? (
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="isInternal" className="size-3.5 rounded border-slate-300 accent-amber-500" />
            Internal note (hidden from the customer)
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
