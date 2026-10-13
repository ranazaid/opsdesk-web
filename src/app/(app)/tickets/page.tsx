import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { PageBody, PageHeader, PageSkeleton } from "@/components/shell/page-header";
import { PriorityLabel, StatusBadge } from "@/components/tickets/badges";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PRIORITY_LABELS, STATUS_LABELS, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/domain";
import { formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { type TicketFilters, ticketFiltersSchema } from "@/lib/validators/tickets";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAssignableMembers, listTickets } from "@/server/tickets/service";

export const metadata: Metadata = { title: "Tickets" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TicketsView searchParams={searchParams} />
    </Suspense>
  );
}

function firstValues(params: SearchParams): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
}

function hrefWith(filters: TicketFilters, patch: Partial<TicketFilters>): string {
  const merged = { ...filters, ...patch };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "" || (key === "pageSize" && value === 20) || (key === "page" && value === 1)) continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `/tickets?${qs}` : "/tickets";
}

async function TicketsView({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireActor();
  const db = await getDb();
  const parsed = ticketFiltersSchema.safeParse(firstValues(await searchParams));
  const filters = parsed.success ? parsed.data : ticketFiltersSchema.parse({});
  const [result, assignees] = await Promise.all([listTickets(db, actor, filters), listAssignableMembers(db, actor)]);
  const now = new Date();
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.total, result.page * result.pageSize);

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Every client request across your organization."
        actions={
          can(actor.role, "ticket:create") ? (
            <Link href="/tickets/new" className={buttonClasses()}>
              <Plus className="size-4" aria-hidden />
              New ticket
            </Link>
          ) : null
        }
      />
      <PageBody>
        <form method="get" className="flex flex-wrap items-end gap-3" role="search" aria-label="Filter tickets">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" aria-hidden />
            <Input
              name="q"
              defaultValue={filters.q}
              placeholder="Search subject, requester or #number"
              className="pl-9"
              aria-label="Search"
            />
          </div>
          <Select name="status" defaultValue={filters.status ?? ""} aria-label="Status" className="w-40">
            <option value="">All statuses</option>
            <option value="active">Open + pending</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
          <Select name="priority" defaultValue={filters.priority ?? ""} aria-label="Priority" className="w-36">
            <option value="">All priorities</option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>
          <Select name="assignee" defaultValue={filters.assignee ?? ""} aria-label="Assignee" className="w-44">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClasses("secondary")}>
            Apply
          </button>
          <Link href="/tickets" className={buttonClasses("ghost")}>
            Clear
          </Link>
        </form>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">Ticket</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Priority</th>
                  <th scope="col" className="px-3 py-3">Assignee</th>
                  <th scope="col" className="px-5 py-3 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((ticket) => (
                  <tr key={ticket.id} className="group hover:bg-slate-50">
                    <td className="max-w-md px-5 py-3">
                      <Link href={`/tickets/${ticket.id}`} className="block">
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-slate-400">#{ticket.number}</span>
                          <span className="truncate font-medium text-slate-900 group-hover:text-brand-700">
                            {ticket.subject}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {ticket.requesterName} · {ticket.requesterEmail}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-3 py-3">
                      <PriorityLabel priority={ticket.priority} />
                    </td>
                    <td className="px-3 py-3">
                      {ticket.assigneeName ? (
                        <span className="inline-flex items-center gap-2 text-slate-700">
                          <Avatar name={ticket.assigneeName} size="sm" />
                          <span className="whitespace-nowrap">{ticket.assigneeName}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-xs whitespace-nowrap text-slate-500">
                      {formatRelative(ticket.updatedAt, now)}
                    </td>
                  </tr>
                ))}
                {result.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                      No tickets match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
            <span>
              Showing {from}–{to} of {result.total}
            </span>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <Link href={hrefWith(filters, { page: result.page - 1 })} className={buttonClasses("secondary", "sm")}>
                  <ChevronLeft className="size-3.5" aria-hidden /> Previous
                </Link>
              ) : null}
              {result.page < pages ? (
                <Link href={hrefWith(filters, { page: result.page + 1 })} className={buttonClasses("secondary", "sm")}>
                  Next <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
