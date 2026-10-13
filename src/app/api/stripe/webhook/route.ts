import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/server/billing/webhook";
import { getBillingConfig, getStripe, priceToPlanResolver } from "@/server/billing/stripe";
import { getDb } from "@/server/db/client";
import { errorResponse } from "@/server/http";

/**
 * Stripe webhook endpoint. The signature is computed over the exact bytes
 * Stripe sent, so the body is read with `request.text()`, never re-serialised JSON.
 */
export async function POST(request: Request) {
  const config = getBillingConfig();
  const stripe = getStripe(config);
  if (!stripe || !config.webhookSecret) {
    return NextResponse.json({ error: { code: "not_configured", message: "Stripe is not configured" } }, { status: 503 });
  }

  try {
    const outcome = await handleStripeWebhook(
      { db: await getDb(), stripe, webhookSecret: config.webhookSecret, priceToPlan: priceToPlanResolver(config.prices) },
      await request.text(),
      request.headers.get("stripe-signature"),
    );
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    return errorResponse(error);
  }
}
