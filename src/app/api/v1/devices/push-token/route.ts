import { NextResponse } from "next/server";
import { registerPushTokenSchema } from "@/lib/validators/devices";
import { apiContext } from "@/server/auth/bearer";
import { registerPushToken } from "@/server/devices/service";
import { parseJson, withApi } from "@/server/http";

/** POST /api/v1/devices/push-token  { token: "ExponentPushToken[...]", platform: "ios" | "android" } */
export const POST = withApi("v1.devices.push_token", async (request) => {
  const { db, actor } = await apiContext(request);
  const input = await parseJson(request, registerPushTokenSchema);
  await registerPushToken(db, actor, input);
  return NextResponse.json({ ok: true });
});
