import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";
import { ActivityFeed } from "@/components/activity-feed";
import { PageBody, PageHeader, PageSkeleton } from "@/components/shell/page-header";
import { PriorityLabel, StatusBadge } from "@/components/tickets/badges";
import { CommentForm } from "@/components/tickets/comment-form";
import { TicketPropertiesForm } from "@/components/tickets/ticket-properties-form";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { entitlementsFor } from "@/lib/plans";
import { uuidSchema } from "@/lib/validators/common";
import { getAiProvider } from "@/server/ai";
import { requireActor } from "@/server/auth/session";
import { getUsage } from "@/server/billing/entitlements";
import { getDb } from "@/server/db/client";
import { NotFoundError } from "@/server/errors";
import {
  getTicket,
  listAssignableMembers,
  listComments,
  listTicketActivity,
  memberNameMap,
} from "@/server/tickets/service";

export const metadata: Metadata = { title: "Ticket" };

export default function TicketPage({ params }: PageProps<"/tickets/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TicketView params={params} />
    </Suspense>
  );
}

async function loadTicket(id: string) {
  if (!uuidSchema.safeParse(id).success) notFound();
  const actor = await requireActor();
  const db = await getDb();
  try {
    const ticket = await getTicket(db, actor, id);
    const [comments, activity, assignees, names, usage] = await Promise.all([
      listComments(db, actor, id),
      can(actor.role, "audit:read") ? listTicketActivity(db, actor, id) : Promise.resolve([]),
      listAssignableMembers(db, actor),
      memberNameMap(db, actor.orgId),
      getUsage(db, actor.orgId),
    ]);
    return { actor, ticket, comments, activity, assignees, names, usage };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

async function TicketView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, ticket, comments, activity, assignees, names, usage } = await loadTicket(id);
  const now = new Date();
  const provider = getAiProvider();

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-base font-normal text-slate-400">#{ticket.number}</span>
            {ticket.subject}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={ticket.status} />
            <PriorityLabel priority={ticket.priority} />
            <span>
              Opened {formatRelative(ticket.createdAt, now)} by {ticket.requesterName}
            </span>
          </span>
        }
        actions={
          <Link href="/tickets" className={buttonClasses("ghost", "sm")}>
            <ArrowLeft className="size-3.5" aria-hidden /> All tickets
          </Link>
        }
      />
      <PageBody>
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card>
              <div className="flex items-start gap-3 p-5">
                <Avatar name={ticket.requesterName} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {ticket.requesterName}{" "}
                      <a
                        href={`mailto:${ticket.requesterEmail}`}
                        className="ml-1 inline-flex items-center gap-1 text-xs font-normal text-slate-500 hover:text-brand-700"
                      >
                        <Mail className="size-3" aria-hidden />
                        {ticket.requesterEmail}
                      </a>
                    </p>
                    <time className="text-xs text-slate-400" dateTime={new Date(ticket.createdAt).toISOString()}>
                      {formatDateTime(ticket.createdAt)}
                    </time>
                  </div>
                  <p className="mt-2 text-sm leading-6 whitespace-pre-line text-slate-700">{ticket.description}</p>
                </div>
              </div>
            </Card>

            <section aria-label="Conversation" className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Conversation <span className="font-normal text-slate-400">({comments.length})</span>
              </h2>
              {comments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 px-5 py-6 text-center text-sm text-slate-500">
                  No replies yet.
                </p>
              ) : null}
              {comments.map((comment) => {
                const fromCustomer = comment.authorId === null;
                return (
                  <article
                    key={comment.id}
                    className={cn(
                      "rounded-xl border p-4",
                      comment.isInternal
                        ? "border-amber-200 bg-amber-50/70"
                        : fromCustomer
                          ? "border-slate-200 bg-white"
                          : "border-brand-100 bg-brand-50/40",
                    )}
                  >
                    <header className="flex flex-wrap items-center gap-2">
                      <Avatar name={comment.authorName} size="sm" />
                      <span className="text-sm font-medium text-slate-900">{comment.authorName}</span>
                      {comment.isInternal ? (
                        <Badge tone="amber">
                          <Lock className="size-3" aria-hidden /> Internal note
                        </Badge>
                      ) : fromCustomer ? (
                        <Badge>Customer</Badge>
                      ) : (
                        <Badge tone="brand">Team</Badge>
                      )}
                      <time className="ml-auto text-xs text-slate-400" dateTime={new Date(comment.createdAt).toISOString()}>
                        {formatRelative(comment.createdAt, now)}
                      </time>
                    </header>
                    <p className="mt-2 text-sm leading-6 whitespace-pre-line text-slate-700">{comment.body}</p>
                  </article>
                );
              })}
            </section>

            {can(actor.role, "comment:create") ? (
              <Card className="p-5">
                <CommentForm ticketId={ticket.id} canWriteInternal={can(actor.role, "comment:internal")} />
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            {can(actor.role, "ai:use") ? (
              <AiAssistPanel
                ticketId={ticket.id}
                providerLabel={provider.name === "mock" ? "Offline mock" : `Claude · ${provider.model}`}
                used={usage.aiRequestsThisMonth}
                limit={entitlementsFor(actor.plan).aiRequestsPerMonth}
              />
            ) : null}

            <Card>
              <CardHeader title="Properties" />
              <TicketPropertiesForm
                key={`${ticket.status}-${ticket.priority}-${ticket.assigneeId}`}
                ticketId={ticket.id}
                status={ticket.status}
                priority={ticket.priority}
                assigneeId={ticket.assigneeId}
                assignees={assignees}
                canUpdate={can(actor.role, "ticket:update")}
                canAssign={can(actor.role, "ticket:assign")}
              />
            </Card>

            {can(actor.role, "audit:read") ? (
              <Card>
                <CardHeader title="Activity" description="Audit log for this ticket" />
                <ActivityFeed items={activity} names={names} now={now} />
              </Card>
            ) : null}
          </div>
        </div>
      </PageBody>
    </>
  );
}
