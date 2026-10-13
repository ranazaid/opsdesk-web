import type { Plan } from "./domain";

export interface Entitlements {
  /** Maximum members in the organization. */
  seats: number;
  /** AI summaries + drafted replies per calendar month (UTC). */
  aiRequestsPerMonth: number;
}

export interface PlanDefinition extends Entitlements {
  id: Plan;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  features: string[];
}

/** Plan catalogue. Prices are display-only; Stripe Price objects are the billing source of truth. */
export const PLAN_DEFINITIONS: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyUsd: 0,
    tagline: "For freelancers getting started",
    seats: 3,
    aiRequestsPerMonth: 25,
    features: ["Up to 3 team members", "25 AI assists / month", "Ticket audit log"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyUsd: 49,
    tagline: "For growing agencies",
    seats: 10,
    aiRequestsPerMonth: 500,
    features: ["Up to 10 team members", "500 AI assists / month", "REST API & mobile app", "Priority email support"],
  },
  business: {
    id: "business",
    name: "Business",
    priceMonthlyUsd: 149,
    tagline: "For multi-team agencies",
    seats: 50,
    aiRequestsPerMonth: 5000,
    features: ["Up to 50 team members", "5,000 AI assists / month", "Datadog-ready audit exports", "SSO-ready (roadmap)"],
  },
};

export function entitlementsFor(plan: Plan): Entitlements {
  const { seats, aiRequestsPerMonth } = PLAN_DEFINITIONS[plan];
  return { seats, aiRequestsPerMonth };
}
