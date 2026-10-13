import Stripe from "stripe";
import type { Plan } from "@/lib/domain";

export interface BillingConfig {
  secretKey: string | null;
  webhookSecret: string | null;
  prices: { pro: string | null; business: string | null };
}

export function getBillingConfig(): BillingConfig {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY || null,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
    prices: {
      pro: process.env.STRIPE_PRICE_PRO || null,
      business: process.env.STRIPE_PRICE_BUSINESS || null,
    },
  };
}

export function isStripeConfigured(config = getBillingConfig()): boolean {
  return Boolean(config.secretKey && config.prices.pro && config.prices.business);
}

let client: Stripe | null = null;

/** Lazily constructed Stripe client; `null` when billing isn't configured (local demo). */
export function getStripe(config = getBillingConfig()): Stripe | null {
  if (!config.secretKey) return null;
  client ??= new Stripe(config.secretKey, {
    appInfo: { name: "OpsDesk", url: "https://github.com/ranazaid/opsdesk-web" },
    maxNetworkRetries: 2,
  });
  return client;
}

/** Lookup keys let the same code work across Stripe accounts without env changes. */
const LOOKUP_KEYS: Record<string, Plan> = { opsdesk_pro: "pro", opsdesk_business: "business" };

export type PriceToPlan = (price: Pick<Stripe.Price, "id" | "lookup_key">) => Plan | null;

export function priceToPlanResolver(prices: BillingConfig["prices"]): PriceToPlan {
  return (price) => {
    if (prices.pro && price.id === prices.pro) return "pro";
    if (prices.business && price.id === prices.business) return "business";
    return (price.lookup_key && LOOKUP_KEYS[price.lookup_key]) || null;
  };
}
