import { NextResponse } from "next/server";
import { createCommentSchema } from "@/lib/validators/tickets";
import { apiContext } from "@/server/auth/bearer";
import { parseId, parseJson, withApi } from "@/server/http";
import { addComment, listComments } from "@/server/tickets/service";

type Context = RouteContext<"/api/v1/tickets/[id]/comments">;

export const GET = withApi("v1.comments.list", async (request, { params }: Context) => {
  const { db, actor } = await apiContext(request);
  const comments = await listComments(db, actor, parseId((await params).id));
  return NextResponse.json({ comments });
});

export const POST = withApi("v1.comments.create", async (request, { params }: Context) => {
  const { db, actor } = await apiContext(request);
  const input = await parseJson(request, createCommentSchema);
  const comment = await addComment(db, actor, parseId((await params).id), input);
  return NextResponse.json({ comment }, { status: 201 });
});
