import { NextResponse } from "next/server";
import { createTicketSchema, ticketFiltersSchema } from "@/lib/validators/tickets";
import { apiContext } from "@/server/auth/bearer";
import { parseJson, withApi } from "@/server/http";
import { track } from "@/server/observability/metrics";
import { createTicket, listTickets } from "@/server/tickets/service";

/** GET /api/v1/tickets?status=&priority=&assignee=&q=&page=&pageSize= */
export const GET = withApi("v1.tickets.list", async (request) => {
  const { db, actor } = await apiContext(request);
  const filters = ticketFiltersSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json(await listTickets(db, actor, filters));
});

export const POST = withApi("v1.tickets.create", async (request) => {
  const { db, actor } = await apiContext(request);
  const input = await parseJson(request, createTicketSchema);
  const ticket = await createTicket(db, actor, input);
  track.ticketCreated({ plan: actor.plan, priority: ticket.priority, channel: "api" });
  return NextResponse.json({ ticket }, { status: 201 });
});
