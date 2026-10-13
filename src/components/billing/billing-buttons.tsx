"use client";

import { useActionState } from "react";
import { ExternalLink } from "lucide-react";
import { checkoutAction, portalAction } from "@/app/(app)/billing/actions";
import { Button } from "@/components/ui/button";
import { type ActionState, idleState } from "@/lib/action-state";

function ErrorText({ state }: { state: ActionState }) {
  return state.status === "error" ? <p className="mt-2 text-xs text-rose-600">{state.error}</p> : null;
}

export function UpgradeButton({ plan, label, disabled }: { plan: "pro" | "business"; label: string; disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(checkoutAction, idleState);
  return (
    <form action={formAction}>
      <input type="hidden" name="plan" value={plan} />
      <Button type="submit" className="w-full" disabled={disabled || pending}>
        {pending ? "Redirecting to Stripe…" : label}
      </Button>
      <ErrorText state={state} />
    </form>
  );
}

export function ManageBillingButton({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(portalAction, idleState);
  return (
    <form action={formAction}>
      <Button type="submit" variant="secondary" disabled={disabled || pending}>
        <ExternalLink className="size-4" aria-hidden />
        {pending ? "Opening portal…" : "Manage billing"}
      </Button>
      <ErrorText state={state} />
    </form>
  );
}
