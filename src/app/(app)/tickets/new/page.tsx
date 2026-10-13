import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBody, PageHeader, PageSkeleton } from "@/components/shell/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/permissions";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { ForbiddenError } from "@/server/errors";
import { listAssignableMembers } from "@/server/tickets/service";

export const metadata: Metadata = { title: "New ticket" };

export default function NewTicketPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewTicket />
    </Suspense>
  );
}

async function NewTicket() {
  const actor = await requireActor();
  if (!can(actor.role, "ticket:create")) throw new ForbiddenError();
  const assignees = await listAssignableMembers(await getDb(), actor);

  return (
    <>
      <PageHeader title="New ticket" description="Log a request on behalf of a client." />
      <PageBody>
        <Card className="max-w-3xl p-6">
          <NewTicketForm assignees={assignees} canAssign={can(actor.role, "ticket:assign")} />
        </Card>
      </PageBody>
    </>
  );
}
