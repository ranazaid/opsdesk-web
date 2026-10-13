import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertOctagon, CheckCircle2, Clock, Inbox, UserCheck } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { CreatedPerDayChart } from "@/components/dashboard/created-chart";
import { PageBody, PageHeader, PageSkeleton } from "@/components/shell/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { can } from "@/lib/permissions";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getDashboardStats, memberNameMap, ticketLinkMap } from "@/server/tickets/service";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const actor = await requireActor();
  const db = await getDb();
  const now = new Date();
  const stats = await getDashboardStats(db, actor, now);
  const [names, links] = await Promise.all([
    memberNameMap(db, actor.orgId),
    ticketLinkMap(
      db,
      actor,
      stats.recentActivity.flatMap((item) => (item.entityId ? [item.entityId] : [])),
    ),
  ]);
  const firstName = actor.name.split(" ")[0];

  const kpis = [
    { label: "Open tickets", value: stats.statusCounts.open, icon: Inbox, href: "/tickets?status=open", tone: "text-sky-600 bg-sky-50" },
    { label: "Awaiting customer", value: stats.statusCounts.pending, icon: Clock, href: "/tickets?status=pending", tone: "text-amber-600 bg-amber-50" },
    { label: "Urgent & unresolved", value: stats.urgentOpen, icon: AlertOctagon, href: "/tickets?status=active&priority=urgent", tone: "text-rose-600 bg-rose-50" },
    { label: "Resolved, last 7 days", value: stats.resolvedLast7Days, icon: CheckCircle2, href: "/tickets?status=resolved", tone: "text-emerald-600 bg-emerald-50" },
  ];

  return (
    <>
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description={`Here's what's happening across ${actor.orgName}'s support queue.`}
        actions={
          can(actor.role, "ticket:create") ? (
            <Link href="/tickets/new" className={buttonClasses()}>
              New ticket
            </Link>
          ) : null
        }
      />
      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon, href, tone }) => (
            <Link key={label} href={href} className="group">
              <Card className="flex items-center gap-4 p-5 transition-shadow group-hover:shadow-md">
                <span className={`grid size-10 place-items-center rounded-lg ${tone}`}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="Tickets created" description="Last 14 days, all channels" />
            <div className="px-5 pt-8 pb-5">
              <CreatedPerDayChart data={stats.createdPerDay} />
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 text-sm">
              <Link href="/tickets?assignee=me&status=active" className="flex items-center gap-2 px-5 py-3 hover:bg-slate-50">
                <UserCheck className="size-4 text-slate-400" aria-hidden />
                <span className="text-slate-600">Assigned to you</span>
                <span className="ml-auto font-semibold text-slate-900 tabular-nums">{stats.assignedToMe}</span>
              </Link>
              <Link href="/tickets?status=closed" className="flex items-center gap-2 px-5 py-3 hover:bg-slate-50">
                <CheckCircle2 className="size-4 text-slate-400" aria-hidden />
                <span className="text-slate-600">Closed all-time</span>
                <span className="ml-auto font-semibold text-slate-900 tabular-nums">{stats.statusCounts.closed}</span>
              </Link>
            </div>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Recent activity" description="Audit log across the organization" />
            <ActivityFeed items={stats.recentActivity} names={names} now={now} ticketLinks={links} />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
