"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/config/server-env";
import { getDb } from "@/lib/db/client";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getClientIp, hashIdentifier } from "@/lib/security/request";
import { getAuth } from "@/modules/auth/server";
import { configuredSetupToken, runInitialSetup } from "@/modules/auth/setup";

export type SetupState = { error?: string };

export async function setupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const db = getDb();
  const ip = hashIdentifier(serverEnv().BETTER_AUTH_SECRET, getClientIp(await headers()));
  const limit = await consumeRateLimit(db, `setup:ip:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!limit.allowed) return { error: "Zu viele Versuche – bitte in 15 Minuten erneut." };

  const result = await runInitialSetup(
    getAuth(),
    db,
    {
      token: formData.get("token"),
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      passwordRepeat: formData.get("passwordRepeat"),
    },
    configuredSetupToken(),
  );
  if (!result.ok) return { error: result.error };
  redirect("/login?eingerichtet=1");
}
