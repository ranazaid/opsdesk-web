"use client";

import { useActionState } from "react";
import { addMemberAction } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { FormError, Input, Label, Select } from "@/components/ui/form";
import { type ActionState, idleState } from "@/lib/action-state";
import { ROLE_LABELS, type Role } from "@/lib/domain";

export function AddMemberForm({ assignable, seatsFull }: { assignable: Role[]; seatsFull: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addMemberAction, idleState);
  return (
    <form action={formAction} className="space-y-3 p-5">
      <div>
        <Label htmlFor="member-name">Name</Label>
        <Input id="member-name" name="name" required maxLength={120} placeholder="Sam Taylor" />
      </div>
      <div>
        <Label htmlFor="member-email">Email</Label>
        <Input id="member-email" name="email" type="email" required placeholder="sam@agency.com" />
      </div>
      <div>
        <Label htmlFor="member-role">Role</Label>
        <Select id="member-role" name="role" defaultValue="agent">
          {assignable.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </div>
      {state.status === "error" ? <FormError message={state.error} /> : null}
      {state.status === "success" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs break-all text-emerald-800">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Adding…" : seatsFull ? "Add member (seat limit reached)" : "Add member"}
      </Button>
    </form>
  );
}
