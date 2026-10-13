"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { changeRoleAction, removeMemberAction } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-state";
import { ROLE_LABELS, type Role } from "@/lib/domain";

export function MemberRoleForm({ userId, role, assignable }: { userId: string; role: Role; assignable: Role[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changeRoleAction.bind(null, userId), idleState);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <Select name="role" defaultValue={role} aria-label="Role" className="h-8 w-32 text-xs">
        {assignable.map((value) => (
          <option key={value} value={value}>
            {ROLE_LABELS[value]}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Save
      </Button>
      {state.status === "error" ? <span className="text-xs text-rose-600">{state.error}</span> : null}
    </form>
  );
}

export function RemoveMemberButton({ userId, name }: { userId: string; name: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(removeMemberAction.bind(null, userId), idleState);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`Remove ${name} from the organization?`)) event.preventDefault();
      }}
      className="flex items-center justify-end gap-2"
    >
      {state.status === "error" ? <span className="text-xs text-rose-600">{state.error}</span> : null}
      <Button type="submit" variant="ghost" size="sm" disabled={pending} title={`Remove ${name}`}>
        <Trash2 className="size-3.5" aria-hidden />
        <span className="sr-only">Remove {name}</span>
      </Button>
    </form>
  );
}
