import { NextResponse } from "next/server";
import { updateTicketSchema } from "@/lib/validators/tickets";
import { apiContext } from "@/server/auth/bearer";
import { parseId, parseJson, withApi } from "@/server/http";
import { getTicket, updateTicket } from "@/server/tickets/service";

type Context = RouteContext<"/api/v1/tickets/[id]">;

export const GET = withApi("v1.tickets.get", async (request, { params }: Context) => {
  const { db, actor } = await apiContext(request);
  const ticket = await getTicket(db, actor, parseId((await params).id));
  return NextResponse.json({ ticket });
});

export const PATCH = withApi("v1.tickets.update", async (request, { params }: Context) => {
  const { db, actor } = await apiContext(request);
  const input = await parseJson(request, updateTicketSchema);
  const ticket = await updateTicket(db, actor, parseId((await params).id), input);
  return NextResponse.json({ ticket });
});
