import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as registerPushTokenRoute } from "@/app/api/v1/devices/push-token/route";
import { GET as listMembersRoute } from "@/app/api/v1/members/route";
import { registerPushTokenSchema } from "@/lib/validators/devices";
import { signToken } from "@/server/auth/tokens";
import type { DatabaseHandle } from "@/server/db/client";
import { pushTokens } from "@/server/db/schema";
import { listPushTokens, registerPushToken } from "@/server/devices/service";
import { UnauthorizedError } from "@/server/errors";
import { createTestDb, type TestDb } from "./support/db";

/*
 * Endpoints used only by the React Native companion app (opsdesk-mobile):
 * GET /api/v1/members and POST /api/v1/devices/push-token. Route handlers are
 * exercised end to end (bearer auth -> validation -> service -> JSON) against
 * an in-memory PGlite database.
 */
let t: TestDb;
const globalForDb = globalThis as typeof globalThis & { __opsdeskDb?: Promise<DatabaseHandle> };

const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

beforeAll(async () => {
  t = await createTestDb();
  globalForDb.__opsdeskDb = Promise.resolve(t.handle); // route handlers resolve the DB through getDb()
});
afterAll(async () => {
  delete globalForDb.__opsdeskDb;
  await t.handle.close();
});

async function bearer(userId: string, orgId = t.seed.northwind.orgId) {
  return `Bearer ${await signToken({ userId, orgId }, "opsdesk:api")}`;
}

function request(path: string, init: { method?: string; authorization?: string; body?: unknown } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.authorization) headers.set("authorization", init.authorization);
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("GET /api/v1/members", () => {
  it("returns only the caller's organization members", async () => {
    const response = await listMembersRoute(request("/api/v1/members", { authorization: await bearer(t.seed.northwind.users.aisha) }), {});
    expect(response.status).toBe(200);
    const { members } = (await response.json()) as { members: { userId: string; email: string; role: string }[] };

    expect(members.map((m) => m.email).sort()).toEqual([
      "adam@northwind.test",
      "aisha@northwind.test",
      "marco@northwind.test",
      "olivia@northwind.test",
      "victor@northwind.test",
    ]);
    expect(members.every((m) => !m.email.endsWith("@globex.test"))).toBe(true);
    expect(members.find((m) => m.email === "victor@northwind.test")?.role).toBe("viewer");
  });

  it("is scoped to the token's organization", async () => {
    const response = await listMembersRoute(
      request("/api/v1/members", { authorization: await bearer(t.seed.globex.ownerId, t.seed.globex.orgId) }),
      {},
    );
    const { members } = (await response.json()) as { members: { email: string }[] };
    expect(members.map((m) => m.email)).toEqual(["gina@globex.test"]);
  });

  it("is readable by viewers (member:read) and rejects anonymous callers", async () => {
    const viewer = await listMembersRoute(request("/api/v1/members", { authorization: await bearer(t.seed.northwind.users.victor) }), {});
    expect(viewer.status).toBe(200);

    const anonymous = await listMembersRoute(request("/api/v1/members"), {});
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ error: { code: "unauthorized" } });
  });
});

describe("POST /api/v1/devices/push-token", () => {
  it("stores the token for the caller and is idempotent", async () => {
    const authorization = await bearer(t.seed.northwind.users.aisha);
    for (let i = 0; i < 2; i++) {
      const response = await registerPushTokenRoute(
        request("/api/v1/devices/push-token", { method: "POST", authorization, body: { token: TOKEN_A, platform: "ios" } }),
        {},
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }

    const rows = await t.db.select().from(pushTokens).where(eq(pushTokens.token, TOKEN_A));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: t.seed.northwind.users.aisha, orgId: t.seed.northwind.orgId, platform: "ios" });
  });

  it("moves a token to the account that registered it most recently (shared device)", async () => {
    const aisha = await t.actor(t.seed.northwind.users.aisha);
    const marco = await t.actor(t.seed.northwind.users.marco);
    await registerPushToken(t.db, aisha, { token: TOKEN_B, platform: "android" });
    await registerPushToken(t.db, marco, { token: TOKEN_B, platform: "android" });

    expect((await listPushTokens(t.db, aisha.orgId, aisha.userId)).map((r) => r.token)).not.toContain(TOKEN_B);
    expect((await listPushTokens(t.db, marco.orgId, marco.userId)).map((r) => r.token)).toContain(TOKEN_B);
  });

  it("lets viewers register (notifications are read-only)", async () => {
    const response = await registerPushTokenRoute(
      request("/api/v1/devices/push-token", {
        method: "POST",
        authorization: await bearer(t.seed.northwind.users.victor),
        body: { token: "ExponentPushToken[vvvvvvvvvvvvvvvvvvvvvv]", platform: "android" },
      }),
      {},
    );
    expect(response.status).toBe(200);
  });

  it("validates the payload (422) and requires a bearer token (401)", async () => {
    const authorization = await bearer(t.seed.northwind.users.aisha);
    const invalid = await registerPushTokenRoute(
      request("/api/v1/devices/push-token", { method: "POST", authorization, body: { token: "not-a-token", platform: "windows" } }),
      {},
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ error: { code: "validation_failed" } });

    const anonymous = await registerPushTokenRoute(
      request("/api/v1/devices/push-token", { method: "POST", body: { token: TOKEN_A, platform: "ios" } }),
      {},
    );
    expect(anonymous.status).toBe(401);
  });

  it("refuses anonymous service calls", async () => {
    await expect(registerPushToken(t.db, null, { token: TOKEN_A, platform: "ios" })).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("registerPushTokenSchema", () => {
  it.each([
    ["ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", true],
    ["ExpoPushToken[abc_DEF-123456]", true],
    ["ExponentPushToken[]", false],
    ["apns-raw-device-token", false],
    ["ExponentPushToken[<script>]", false],
  ])("%s -> %s", (token, ok) => {
    expect(registerPushTokenSchema.safeParse({ token, platform: "ios" }).success).toBe(ok);
  });
});
