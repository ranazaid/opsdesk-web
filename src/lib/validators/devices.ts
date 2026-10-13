import { z } from "zod";
import { PUSH_PLATFORMS } from "@/lib/domain";

/** Expo push tokens look like `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]` (older SDKs: `ExpoPushToken[...]`). */
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

/** POST /api/v1/devices/push-token (mobile app). */
export const registerPushTokenSchema = z.object({
  token: z.string().trim().regex(EXPO_PUSH_TOKEN, "Expected an Expo push token"),
  platform: z.enum(PUSH_PLATFORMS),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
