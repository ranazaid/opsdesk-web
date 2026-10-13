"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validators/auth";
import { authenticate } from "@/server/auth/service";
import { endSession, startSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { clientIp } from "@/server/http";
import { rateLimiters } from "@/server/rate-limit";

export interface LoginState {
  error?: string;
  email?: string;
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", email };
  }

  try {
    rateLimiters.login.enforce(`login:${clientIp(await headers())}:${parsed.data.email}`);
    const actor = await authenticate(await getDb(), parsed.data);
    await startSession(actor);
  } catch (error) {
    if (error instanceof AppError) return { error: error.message, email };
    throw error;
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
