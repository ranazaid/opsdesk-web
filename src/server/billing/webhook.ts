import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { Plan } from "@/lib/domain";
import { recordAudit } from "@/server/audit";
import type { Database, DbExecutor } from "@/server/db/client";
import { organizations, stripeEvents } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import type { PriceToPlan } from "./stripe";

export class WebhookSignatureError extends AppError {
  constructor(message: string) {
    super(message, 400, "invalid_signature");
  }
}

export interface WebhookDeps {
  db: Database;
  stripe: Pick<Stripe, "webhooks">;
  webhookSecret: string;
  priceToPlan: PriceToPlan;
}

export type WebhookOutcome = {
  eventId: string;
  type: string;
  status: "processed" | "duplicate" | "ignored";
};

/** Subscription states that keep paid entitlements (past_due = grace period while Stripe retries). */
const ENTITLED_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set(["active", "trialing", "past_due"]);

/**
 * Verifies and applies a Stripe webhook.
 *
 * 1. `constructEvent` checks the signature against the *raw* request body.
 * 2. The event id is inserted into `stripe_events` in the same transaction as
 *    its side effects. A redelivered event conflicts on the primary key and
 *    is acknowledged as a duplicate without re-applying anything; a failure
 *    rolls both back so Stripe's retry processes it cleanly.
 */
export async function handleStripeWebhook(
  deps: WebhookDeps,
  rawBody: string,
  signature: string | null,
): Promise<WebhookOutcome> {
  if (!signature) throw new WebhookSignatureError("Missing Stripe-Signature header");

  let event: Stripe.Event;
  try {
    event = deps.stripe.webhooks.constructEvent(rawBody, signature, deps.webhookSecret);
  } catch (error) {
    throw new WebhookSignatureError(
      `Webhook signature verification failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  return deps.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing({ target: stripeEvents.id })
      .returning({ id: stripeEvents.id });
    if (inserted.length === 0) return { eventId: event.id, type: event.type, status: "duplicate" as const };

    const applied = await applyEvent(tx, event, deps.priceToPlan);
    return { eventId: event.id, type: event.type, status: applied ? ("processed" as const) : ("ignored" as const) };
  });
}

async function applyEvent(tx: DbExecutor, event: Stripe.Event, priceToPlan: PriceToPlan): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orgId = session.client_reference_id ?? session.metadata?.orgId;
      if (!orgId || session.mode !== "subscription") return false;
      await tx
        .update(organizations)
        .set({
          stripeCustomerId: idOf(session.customer),
          stripeSubscriptionId: idOf(session.subscription),
        })
        .where(eq(organizations.id, orgId));
      return true;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const org = await findOrgForSubscription(tx, subscription);
      if (!org) return false;

      const item = subscription.items.data[0];
      const deleted = event.type === "customer.subscription.deleted";
      const entitled = !deleted && ENTITLED_STATUSES.has(subscription.status);
      const nextPlan: Plan = entitled && item ? (priceToPlan(item.price) ?? org.plan) : "free";

      await tx
        .update(organizations)
        .set({
          plan: nextPlan,
          subscriptionStatus: deleted ? "canceled" : subscription.status,
          stripeCustomerId: idOf(subscription.customer),
          stripeSubscriptionId: deleted ? null : subscription.id,
          currentPeriodEnd: item && !deleted ? new Date(item.current_period_end * 1000) : null,
        })
        .where(eq(organizations.id, org.id));

      if (nextPlan !== org.plan) {
        await recordAudit(tx, { orgId: org.id, userId: null }, {
          action: "billing.plan_changed",
          entityType: "organization",
          entityId: org.id,
          metadata: { from: org.plan, to: nextPlan, stripeEventId: event.id, subscriptionStatus: subscription.status },
        });
      }
      return true;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = idOf(invoice.customer);
      if (!customerId) return false;
      const [org] = await tx
        .update(organizations)
        .set({ subscriptionStatus: "past_due" })
        .where(eq(organizations.stripeCustomerId, customerId))
        .returning({ id: organizations.id });
      if (!org) return false;
      await recordAudit(tx, { orgId: org.id, userId: null }, {
        action: "billing.payment_failed",
        entityType: "organization",
        entityId: org.id,
        metadata: { invoiceId: invoice.id, stripeEventId: event.id },
      });
      return true;
    }

    default:
      return false;
  }
}

async function findOrgForSubscription(tx: DbExecutor, subscription: Stripe.Subscription) {
  const columns = { id: organizations.id, plan: organizations.plan };
  const orgId = subscription.metadata?.orgId;
  if (orgId) {
    const [org] = await tx.select(columns).from(organizations).where(eq(organizations.id, orgId));
    if (org) return org;
  }
  const customerId = idOf(subscription.customer);
  if (!customerId) return null;
  const [org] = await tx.select(columns).from(organizations).where(eq(organizations.stripeCustomerId, customerId));
  return org ?? null;
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
