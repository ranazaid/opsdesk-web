import { NextResponse } from "next/server";
import { apiContext } from "@/server/auth/bearer";
import { withApi } from "@/server/http";
import { listMembers } from "@/server/team/service";

/** GET /api/v1/members: the caller's organization members (requires `member:read`). */
export const GET = withApi("v1.members.list", async (request) => {
  const { db, actor } = await apiContext(request);
  return NextResponse.json({ members: await listMembers(db, actor) });
});
