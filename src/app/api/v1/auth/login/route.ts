import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validators/auth";
import { authenticate } from "@/server/auth/service";
import { API_TOKEN_TTL_SECONDS, signToken } from "@/server/auth/tokens";
import { getDb } from "@/server/db/client";
import { clientIp, parseJson, withApi } from "@/server/http";
import { rateLimiters } from "@/server/rate-limit";

/** Exchanges email + password for a short-lived API bearer token (mobile app). */
export const POST = withApi("v1.auth.login", async (request) => {
  const input = await parseJson(request, loginSchema);
  rateLimiters.login.enforce(`login:${clientIp(request.headers)}:${input.email}`);

  const actor = await authenticate(await getDb(), input);
  const token = await signToken(actor, "opsdesk:api", API_TOKEN_TTL_SECONDS);

  return NextResponse.json({
    accessToken: token,
    tokenType: "Bearer",
    expiresIn: API_TOKEN_TTL_SECONDS,
    user: { id: actor.userId, email: actor.email, name: actor.name },
    organization: { id: actor.orgId, name: actor.orgName, plan: actor.plan, role: actor.role },
  });
});
