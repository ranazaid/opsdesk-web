"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { checkoutSchema } from "@/lib/validators/billing";
import { toActionError } from "@/server/actions";
import { requireActor } from "@/server/auth/session";
import { createCheckoutSession, createPortalSession } from "@/server/billing/service";
import { getBillingConfig, getStripe, isStripeConfigured } from "@/server/billing/stripe";
import { getDb } from "@/server/db/client";

const NOT_CONFIGURED: ActionState = {
  status: "error",
  error: "Stripe isn't configured in this environment. Set the STRIPE_* variables in .env.local to enable billing.",
};

export async function checkoutAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const config = getBillingConfig();
  const stripe = getStripe(config);
  if (!stripe || !isStripeConfigured(config)) return NOT_CONFIGURED;

  let url: string;
  try {
    const input = checkoutSchema.parse({ plan: formData.get("plan") });
    url = await createCheckoutSession(await getDb(), actor, input, stripe, config);
  } catch (error) {
    return toActionError(error);
  }
  redirect(url);
}

export async function portalAction(_previous: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const stripe = getStripe();
  if (!stripe) return NOT_CONFIGURED;

  let url: string;
  try {
    url = await createPortalSession(await getDb(), actor, stripe);
  } catch (error) {
    return toActionError(error);
  }
  redirect(url);
}
