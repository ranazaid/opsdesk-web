import type { Metadata } from "next";
import { Suspense } from "react";
import { Check, CircleAlert, CircleCheck } from "lucide-react";
import { ManageBillingButton, UpgradeButton } from "@/components/billing/billing-buttons";
import { PageBody, PageHeader, PageSkeleton } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { cn } from "@/lib/cn";
import { PLANS } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { PLAN_DEFINITIONS } from "@/lib/plans";
import { requireActor } from "@/server/auth/session";
import { getBillingOverview } from "@/server/billing/service";
import { isStripeConfigured } from "@/server/billing/stripe";
import { getDb } from "@/server/db/client";
import { ForbiddenError } from "@/server/errors";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage({ searchParams }: PageProps<"/billing">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Billing searchParams={searchParams} />
    </Suspense>
  );
}

const PLAN_RANK = { free: 0, pro: 1, business: 2 } as const;

async function Billing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor();
  if (!can(actor.role, "billing:read")) throw new ForbiddenError();
  const [overview, { checkout }] = await Promise.all([getBillingOverview(await getDb(), actor), searchParams]);
  const current = PLAN_DEFINITIONS[overview.plan];
  const canManage = can(actor.role, "billing:manage");
  const stripeReady = isStripeConfigured();

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your subscription, usage and plan limits."
        actions={canManage && overview.hasStripeCustomer ? <ManageBillingButton disabled={!stripeReady} /> : null}
      />
      <PageBody>
        {checkout === "success" ? (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CircleCheck className="size-4" aria-hidden /> Payment received. Your plan updates as soon as Stripe confirms the
            subscription.
          </p>
        ) : null}
        {!stripeReady ? (
          <p className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <CircleAlert className="size-4 text-slate-400" aria-hidden />
            Demo mode: Stripe test keys aren&apos;t set, so checkout is disabled. See <code className="font-mono">.env.example</code>.
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title="Current plan" />
            <div className="space-y-1 px-5 py-4">
              <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight text-slate-900">{current.name}</p>
                {overview.subscriptionStatus ? (
                  <Badge tone={overview.subscriptionStatus === "past_due" ? "amber" : "green"}>
                    {overview.subscriptionStatus.replace("_", " ")}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-slate-500">
                ${current.priceMonthlyUsd}/month
                {overview.currentPeriodEnd ? ` · renews ${formatDate(overview.currentPeriodEnd)}` : ""}
              </p>
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Usage this month" description="Limits are enforced server-side from your plan." />
            <div className="grid gap-6 px-5 py-5 sm:grid-cols-2">
              <Meter label="Team seats" used={overview.usage.seatsUsed} limit={current.seats} />
              <Meter label="AI assists" used={overview.usage.aiRequestsThisMonth} limit={current.aiRequestsPerMonth} />
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {PLANS.map((planId) => {
            const plan = PLAN_DEFINITIONS[planId];
            const isCurrent = planId === overview.plan;
            return (
              <Card key={planId} className={cn("flex flex-col p-6", isCurrent && "ring-2 ring-brand-500")}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
                  {isCurrent ? <Badge tone="brand">Current plan</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
                <p className="mt-4">
                  <span className="text-3xl font-semibold tracking-tight text-slate-900">${plan.priceMonthlyUsd}</span>
                  <span className="text-sm text-slate-500"> / month</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  {isCurrent || planId === "free" || !canManage ? null : overview.hasActiveSubscription ? (
                    <p className="text-center text-xs text-slate-500">Switch plans from “Manage billing”.</p>
                  ) : (
                    <UpgradeButton
                      plan={planId}
                      label={PLAN_RANK[planId] > PLAN_RANK[overview.plan] ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                      disabled={!stripeReady}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
