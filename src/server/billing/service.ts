import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { CheckoutInput } from "@/lib/validators/billing";
import type { Actor } from "@/server/auth/actor";
import { getAppUrl } from "@/server/config";
import type { DbExecutor } from "@/server/db/client";
import { organizations } from "@/server/db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "@/server/errors";
import { requirePermission } from "@/server/rbac";
import { getUsage } from "./entitlements";
import type { BillingConfig } from "./stripe";

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

async function loadOrg(db: DbExecutor, orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new NotFoundError("Organization not found");
  return org;
}

export async function getBillingOverview(db: DbExecutor, actor: Actor) {
  requirePermission(actor, "billing:read");
  const [org, usage] = await Promise.all([loadOrg(db, actor.orgId), getUsage(db, actor.orgId)]);
  return {
    plan: org.plan,
    subscriptionStatus: org.subscriptionStatus,
    currentPeriodEnd: org.currentPeriodEnd,
    hasStripeCustomer: Boolean(org.stripeCustomerId),
    hasActiveSubscription: Boolean(org.stripeSubscriptionId && ACTIVE_STATUSES.has(org.subscriptionStatus ?? "")),
    usage,
  };
}

/**
 * Starts Stripe Checkout for a paid plan. The organization id travels in
 * `client_reference_id` and subscription metadata so webhooks can map the
 * subscription back to the tenant. Plan changes for existing subscribers go
 * through the Customer Portal instead.
 */
export async function createCheckoutSession(
  db: DbExecutor,
  actor: Actor,
  input: CheckoutInput,
  stripe: Stripe,
  config: BillingConfig,
): Promise<string> {
  requirePermission(actor, "billing:manage");
  const org = await loadOrg(db, actor.orgId);
  if (org.stripeSubscriptionId && ACTIVE_STATUSES.has(org.subscriptionStatus ?? "")) {
    throw new ConflictError("You already have a subscription. Use “Manage billing” to change plans.");
  }
  const price = config.prices[input.plan];
  if (!price) throw new BadRequestError(`No Stripe price configured for the ${input.plan} plan`);

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create(
      { name: org.name, email: actor.email, metadata: { orgId: org.id } },
      { idempotencyKey: `customer-create-${org.id}` },
    );
    customerId = customer.id;
    await db.update(organizations).set({ stripeCustomerId: customerId }).where(eq(organizations.id, org.id));
  }

  const appUrl = getAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: org.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { orgId: org.id } },
    metadata: { orgId: org.id, plan: input.plan },
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=cancelled`,
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

/** Opens the Stripe Customer Portal (update card, switch plan, cancel, invoices). */
export async function createPortalSession(db: DbExecutor, actor: Actor, stripe: Stripe): Promise<string> {
  requirePermission(actor, "billing:manage");
  const org = await loadOrg(db, actor.orgId);
  if (!org.stripeCustomerId) throw new BadRequestError("This organization has no billing account yet");
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${getAppUrl()}/billing`,
  });
  return session.url;
}
