import { NextResponse } from "next/server";
import { authenticateBearer } from "@/server/auth/bearer";
import { getDb } from "@/server/db/client";
import { withApi } from "@/server/http";

export const GET = withApi("v1.me", async (request) => {
  const actor = await authenticateBearer(await getDb(), request);
  return NextResponse.json({
    user: { id: actor.userId, email: actor.email, name: actor.name },
    organization: { id: actor.orgId, name: actor.orgName, plan: actor.plan },
    role: actor.role,
  });
});
