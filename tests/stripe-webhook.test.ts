import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { entitlementsFor } from "@/lib/plans";
import { getOrgPlan } from "@/server/billing/entitlements";
import { priceToPlanResolver } from "@/server/billing/stripe";
import { handleStripeWebhook, type WebhookDeps, WebhookSignatureError } from "@/server/billing/webhook";
import { auditLogs, organizations, stripeEvents } from "@/server/db/schema";
import { PlanLimitError } from "@/server/errors";
import { addMember } from "@/server/team/service";
import { createTestDb, type TestDb } from "./support/db";

const WEBHOOK_SECRET = "whsec_test_opsdesk";
const PRICES = { pro: "price_pro_test", business: "price_business_test" };
const stripe = new Stripe("sk_test_not_a_real_key");

let t: TestDb;
let deps: WebhookDeps;
let orgId: string;

/** Serialises an event and signs it exactly as Stripe would. */
function sign(event: object, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  return { payload, signature: stripe.webhooks.generateTestHeaderString({ payload, secret }) };
}

let sequence = 0;
function subscriptionEvent(
  type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted",
  { price = PRICES.pro, status = "active" }: { price?: string; status?: Stripe.Subscription.Status } = {},
) {
  sequence += 1;
  return {
    id: `evt_test_${sequence}`,
    object: "event",
    type,
    created: 1_790_000_000 + sequence,
    livemode: false,
    data: {
      object: {
        id: "sub_test_globex",
        object: "subscription",
        customer: "cus_test_globex",
        status,
        metadata: { orgId },
        items: {
          object: "list",
          data: [{ id: "si_test", object: "subscription_item", price: { id: price, lookup_key: null }, current_period_end: 1_800_000_000 }],
        },
      },
    },
  };
}

async function deliver(event: object) {
  const { payload, signature } = sign(event);
  return handleStripeWebhook(deps, payload, signature);
}

beforeAll(async () => {
  t = await createTestDb();
  orgId = t.seed.globex.orgId; // starts on the Free plan
  deps = { db: t.db, stripe, webhookSecret: WEBHOOK_SECRET, priceToPlan: priceToPlanResolver(PRICES) };
});

afterAll(() => t.handle.close());

describe("Stripe webhook: signature verification", () => {
  it("rejects a payload signed with the wrong secret", async () => {
    const { payload, signature } = sign(subscriptionEvent("customer.subscription.updated"), "whsec_attacker");
    await expect(handleStripeWebhook(deps, payload, signature)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("rejects a tampered body even with a valid signature header", async () => {
    const { payload, signature } = sign(subscriptionEvent("customer.subscription.updated"));
    const tampered = payload.replace(PRICES.pro, PRICES.business);
    await expect(handleStripeWebhook(deps, tampered, signature)).rejects.toMatchObject({ status: 400, code: "invalid_signature" });
  });

  it("rejects a request without a Stripe-Signature header", async () => {
    await expect(handleStripeWebhook(deps, "{}", null)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("records nothing and changes nothing when verification fails", async () => {
    expect(await t.db.select().from(stripeEvents)).toHaveLength(0);
    expect(await getOrgPlan(t.db, orgId)).toBe("free");
  });
});

describe("Stripe webhook: processing", () => {
  it("links the Stripe customer on checkout.session.completed", async () => {
    const outcome = await deliver({
      id: "evt_checkout_1",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          object: "checkout.session",
          mode: "subscription",
          client_reference_id: orgId,
          customer: "cus_test_globex",
          subscription: "sub_test_globex",
          metadata: {},
        },
      },
    });
    expect(outcome.status).toBe("processed");
    const [org] = await t.db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org).toMatchObject({ stripeCustomerId: "cus_test_globex", stripeSubscriptionId: "sub_test_globex", plan: "free" });
  });

  it("subscription.updated upgrades the plan and its entitlements take effect immediately", async () => {
    const owner = await t.actor(t.seed.globex.ownerId, orgId);
    // Free = 3 seats: fill them, then the next invite is blocked.
    await addMember(t.db, owner, { email: "a1@globex.test", name: "A One", role: "agent" });
    await addMember(t.db, owner, { email: "a2@globex.test", name: "A Two", role: "agent" });
    await expect(addMember(t.db, owner, { email: "a3@globex.test", name: "A Three", role: "agent" })).rejects.toBeInstanceOf(
      PlanLimitError,
    );

    const outcome = await deliver(subscriptionEvent("customer.subscription.updated", { price: PRICES.pro }));
    expect(outcome.status).toBe("processed");
    expect(await getOrgPlan(t.db, orgId)).toBe("pro");
    expect(entitlementsFor("pro")).toEqual({ seats: 10, aiRequestsPerMonth: 500 });

    await expect(addMember(t.db, owner, { email: "a3@globex.test", name: "A Three", role: "agent" })).resolves.toMatchObject({
      temporaryPassword: expect.any(String),
    });

    const [org] = await t.db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org?.subscriptionStatus).toBe("active");
    expect(org?.currentPeriodEnd?.getTime()).toBe(1_800_000_000 * 1000);
  });

  it("is idempotent: a redelivered event is acknowledged but not re-applied", async () => {
    const event = subscriptionEvent("customer.subscription.updated", { price: PRICES.business });
    const first = await deliver(event);
    const second = await deliver(event);

    expect(first.status).toBe("processed");
    expect(second).toEqual({ eventId: event.id, type: event.type, status: "duplicate" });
    expect(await t.db.select().from(stripeEvents).where(eq(stripeEvents.id, event.id))).toHaveLength(1);

    const planChanges = await t.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), eq(auditLogs.action, "billing.plan_changed")));
    expect(planChanges.filter((entry) => entry.metadata.stripeEventId === event.id)).toHaveLength(1);
    expect(await getOrgPlan(t.db, orgId)).toBe("business");
  });

  it("downgrades to Free when the subscription is canceled or deleted", async () => {
    await deliver(subscriptionEvent("customer.subscription.updated", { status: "canceled" }));
    expect(await getOrgPlan(t.db, orgId)).toBe("free");

    await deliver(subscriptionEvent("customer.subscription.created", { price: PRICES.pro }));
    expect(await getOrgPlan(t.db, orgId)).toBe("pro");

    await deliver(subscriptionEvent("customer.subscription.deleted"));
    const [org] = await t.db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org).toMatchObject({ plan: "free", subscriptionStatus: "canceled", stripeSubscriptionId: null });
  });

  it("keeps paid entitlements during past_due (grace period)", async () => {
    await deliver(subscriptionEvent("customer.subscription.updated", { price: PRICES.pro }));
    await deliver(subscriptionEvent("customer.subscription.updated", { price: PRICES.pro, status: "past_due" }));
    expect(await getOrgPlan(t.db, orgId)).toBe("pro");
  });

  it("acknowledges and records event types it doesn't handle", async () => {
    const outcome = await deliver({ id: "evt_unhandled", object: "event", type: "customer.created", data: { object: {} } });
    expect(outcome.status).toBe("ignored");
    expect(await t.db.select().from(stripeEvents).where(eq(stripeEvents.id, "evt_unhandled"))).toHaveLength(1);
  });
});
