import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import QRCode from "qrcode";
import { z } from "zod";
import { serverEnv } from "@/lib/config/server-env";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { consumeRateLimit, RATE_LIMITS, resetRateLimit } from "@/lib/security/rate-limit";
import { getClientIp, hashIdentifier } from "@/lib/security/request";
import { recordAudit } from "@/modules/audit/service";
import { PASSWORD_MAX_LENGTH } from "./auth";
import type { Actor } from "./policy";
import { getAuth } from "./server";

/**
 * Anwendungslogik für Login, 2FA und Sessions. Server Actions sind nur dünne Hüllen
 * hierum. Alle Fehlermeldungen sind bewusst generisch (keine Konto-Enumeration).
 */

export type Result<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const GENERIC_LOGIN_ERROR = "E-Mail-Adresse oder Passwort ist falsch.";
const GENERIC_CODE_ERROR = "Der Code ist ungültig oder abgelaufen.";

function minutes(seconds: number) {
  return Math.max(1, Math.ceil(seconds / 60));
}

function errorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const body = error.body as { code?: string } | undefined;
  return body?.code;
}

function requestContext(requestHeaders: Headers) {
  const secret = serverEnv().BETTER_AUTH_SECRET;
  const ip = getClientIp(requestHeaders);
  return { ipHash: hashIdentifier(secret, ip), secret };
}

// ---------------------------------------------------------------------------
// Login (1. Faktor)
// ---------------------------------------------------------------------------

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export type LoginOutcome = { next: "two-factor" | "app" };

export async function signIn(input: unknown, requestHeaders: Headers): Promise<Result<LoginOutcome>> {
  const db = getDb();
  const parsed = loginInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: GENERIC_LOGIN_ERROR };
  const { email, password } = parsed.data;

  const { ipHash, secret } = requestContext(requestHeaders);
  const emailHash = hashIdentifier(secret, email);
  const accountKey = `login:acct:${emailHash}:${ipHash}`;

  const perIp = await consumeRateLimit(db, `login:ip:${ipHash}`, RATE_LIMITS.loginPerIp);
  const perAccount = await consumeRateLimit(db, accountKey, RATE_LIMITS.loginPerAccount);
  if (!perIp.allowed || !perAccount.allowed) {
    await recordAudit(db, { actorType: "user", action: "auth.login.rate_limited", metadata: { emailHash }, ipHash });
    const wait = Math.max(
      perIp.allowed ? 0 : perIp.retryAfterSeconds,
      perAccount.allowed ? 0 : perAccount.retryAfterSeconds,
    );
    return { ok: false, error: `Zu viele Anmeldeversuche. Bitte in ${minutes(wait)} Minuten erneut versuchen.` };
  }

  try {
    const result = await getAuth().api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: requestHeaders,
    });
    await resetRateLimit(db, accountKey, RATE_LIMITS.loginPerAccount);

    if ("twoFactorRedirect" in result && result.twoFactorRedirect) {
      await recordAudit(db, {
        actorType: "user",
        action: "auth.login.succeeded",
        metadata: { emailHash, stage: "password" },
        ipHash,
      });
      return { ok: true, data: { next: "two-factor" } };
    }

    const user = "user" in result ? result.user : undefined;
    await recordAudit(db, {
      actorType: "user",
      actorId: user?.id ?? null,
      action: "auth.login.succeeded",
      metadata: { stage: "password", twoFactor: false },
      ipHash,
    });
    return { ok: true, data: { next: "app" } };
  } catch (error) {
    await recordAudit(db, {
      actorType: "user",
      action: "auth.login.failed",
      metadata: { emailHash, reason: errorCode(error) ?? "unknown" },
      ipHash,
    });
    if (!isAPIError(error)) throw error;
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
}

// ---------------------------------------------------------------------------
// Login (2. Faktor)
// ---------------------------------------------------------------------------

export const secondFactorSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("totp"),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Sechsstelliger Code erwartet"),
    trustDevice: z.boolean().default(false),
  }),
  z.object({
    method: z.literal("backup"),
    code: z.string().trim().min(6).max(32),
    trustDevice: z.boolean().default(false),
  }),
]);

export async function verifySecondFactor(input: unknown, requestHeaders: Headers): Promise<Result> {
  const db = getDb();
  const parsed = secondFactorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_CODE_ERROR };

  const { ipHash } = requestContext(requestHeaders);
  const limit = await consumeRateLimit(db, `2fa:ip:${ipHash}`, RATE_LIMITS.twoFactorPerIp);
  if (!limit.allowed) {
    return {
      ok: false,
      error: `Zu viele Versuche. Bitte in ${minutes(limit.retryAfterSeconds)} Minuten erneut versuchen.`,
    };
  }

  try {
    const auth = getAuth();
    const result =
      parsed.data.method === "totp"
        ? await auth.api.verifyTOTP({
            body: { code: parsed.data.code, trustDevice: parsed.data.trustDevice },
            headers: requestHeaders,
          })
        : await auth.api.verifyBackupCode({
            body: { code: parsed.data.code, trustDevice: parsed.data.trustDevice },
            headers: requestHeaders,
          });

    const userId = (result as { user?: { id?: string } }).user?.id ?? null;
    await recordAudit(db, {
      actorType: "user",
      actorId: userId,
      action: "auth.2fa.challenge_succeeded",
      metadata: { method: parsed.data.method },
      ipHash,
    });
    return { ok: true };
  } catch (error) {
    const code = errorCode(error);
    await recordAudit(db, {
      actorType: "user",
      action: "auth.2fa.challenge_failed",
      metadata: { method: parsed.data.method, reason: code ?? "unknown" },
      ipHash,
    });
    if (!isAPIError(error)) throw error;
    if (code === "ACCOUNT_TEMPORARILY_LOCKED") {
      return { ok: false, error: "Zu viele Fehlversuche. Das Konto ist für 15 Minuten gesperrt." };
    }
    if (code === "INVALID_TWO_FACTOR_COOKIE") {
      return { ok: false, error: "Die Anmeldung ist abgelaufen. Bitte erneut mit Passwort anmelden." };
    }
    return { ok: false, error: GENERIC_CODE_ERROR };
  }
}

// ---------------------------------------------------------------------------
// 2FA einrichten (optional, über die Einstellungen)
// ---------------------------------------------------------------------------

export type Enrollment = {
  /** Base32-Secret zur manuellen Eingabe, falls der QR-Code nicht scannbar ist. */
  secret: string;
  /** QR-Code als SVG-Data-URL – serverseitig aus der otpauth-URI erzeugt, ohne externe Dienste. */
  qrDataUrl: string;
  backupCodes: string[];
};

export async function startTwoFactorEnrollment(
  userId: string,
  password: string,
  requestHeaders: Headers,
): Promise<Result<Enrollment>> {
  const db = getDb();
  const { ipHash } = requestContext(requestHeaders);
  const limit = await consumeRateLimit(db, `sensitive:${userId}`, RATE_LIMITS.sensitivePerUser);
  if (!limit.allowed) return { ok: false, error: "Zu viele Versuche. Bitte später erneut versuchen." };

  try {
    const result = await getAuth().api.enableTwoFactor({
      body: { password: password.slice(0, PASSWORD_MAX_LENGTH), method: "totp" },
      headers: requestHeaders,
    });
    if (result.method !== "totp") throw new Error("Unerwartete 2FA-Methode");
    const secret = new URL(result.totpURI).searchParams.get("secret") ?? "";
    const svg = await QRCode.toString(result.totpURI, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#202124", light: "#ffffff" },
    });
    const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    await recordAudit(db, { actorType: "user", actorId: userId, action: "auth.2fa.enrollment_started", ipHash });
    return { ok: true, data: { secret, qrDataUrl, backupCodes: result.backupCodes } };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return { ok: false, error: "Das Passwort ist falsch." };
  }
}

export async function confirmTwoFactorEnrollment(
  userId: string,
  code: string,
  requestHeaders: Headers,
): Promise<Result> {
  const db = getDb();
  const parsed = z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .safeParse(code);
  if (!parsed.success) return { ok: false, error: "Bitte den sechsstelligen Code aus der App eingeben." };

  const { ipHash } = requestContext(requestHeaders);
  const limit = await consumeRateLimit(db, `2fa:ip:${ipHash}`, RATE_LIMITS.twoFactorPerIp);
  if (!limit.allowed) return { ok: false, error: "Zu viele Versuche. Bitte später erneut versuchen." };

  try {
    await getAuth().api.verifyTOTP({ body: { code: parsed.data }, headers: requestHeaders });
    await recordAudit(db, { actorType: "user", actorId: userId, action: "auth.2fa.enabled", ipHash });
    return { ok: true };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return { ok: false, error: GENERIC_CODE_ERROR };
  }
}

export async function regenerateBackupCodes(
  actor: Actor,
  password: string,
  requestHeaders: Headers,
): Promise<Result<{ backupCodes: string[] }>> {
  const db = getDb();
  const { ipHash } = requestContext(requestHeaders);
  const limit = await consumeRateLimit(db, `sensitive:${actor.userId}`, RATE_LIMITS.sensitivePerUser);
  if (!limit.allowed) return { ok: false, error: "Zu viele Versuche. Bitte später erneut versuchen." };

  try {
    const result = await getAuth().api.generateBackupCodes({
      body: { password: password.slice(0, PASSWORD_MAX_LENGTH) },
      headers: requestHeaders,
    });
    await recordAudit(db, {
      actorType: "user",
      actorId: actor.userId,
      action: "auth.2fa.backup_codes_regenerated",
      ipHash,
    });
    return { ok: true, data: { backupCodes: result.backupCodes } };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return { ok: false, error: "Das Passwort ist falsch." };
  }
}

export async function disableTwoFactor(actor: Actor, password: string, requestHeaders: Headers): Promise<Result> {
  const db = getDb();
  const { ipHash } = requestContext(requestHeaders);
  const limit = await consumeRateLimit(db, `sensitive:${actor.userId}`, RATE_LIMITS.sensitivePerUser);
  if (!limit.allowed) return { ok: false, error: "Zu viele Versuche. Bitte später erneut versuchen." };

  try {
    await getAuth().api.disableTwoFactor({
      body: { password: password.slice(0, PASSWORD_MAX_LENGTH) },
      headers: requestHeaders,
    });
    await recordAudit(db, { actorType: "user", actorId: actor.userId, action: "auth.2fa.disabled", ipHash });
    return { ok: true };
  } catch (error) {
    if (!isAPIError(error)) throw error;
    return { ok: false, error: "Das Passwort ist falsch." };
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type SessionInfo = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  current: boolean;
};

/** Aktive Sessions des Owners – OHNE Tokens (die verlassen nie den Server). */
export async function listOwnSessions(actor: Actor, currentSessionId: string): Promise<SessionInfo[]> {
  const rows = await getDb()
    .select({
      id: schema.sessions.id,
      createdAt: schema.sessions.createdAt,
      updatedAt: schema.sessions.updatedAt,
      expiresAt: schema.sessions.expiresAt,
      userAgent: schema.sessions.userAgent,
    })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.userId, actor.userId), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.updatedAt));
  return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
}

export async function revokeOwnSession(actor: Actor, sessionId: string, requestHeaders: Headers): Promise<Result> {
  const db = getDb();
  const [target] = await db
    .select({ token: schema.sessions.token })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, actor.userId)));
  // Fremde oder unbekannte Session: wie "nicht gefunden" behandeln.
  if (!target) return { ok: false, error: "Session nicht gefunden." };

  await getAuth().api.revokeSession({ body: { token: target.token }, headers: requestHeaders });
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "auth.session.revoked",
    targetType: "session",
    targetId: sessionId,
    ipHash: requestContext(requestHeaders).ipHash,
  });
  return { ok: true };
}

export async function signOut(actor: Actor | null, requestHeaders: Headers): Promise<void> {
  await getAuth().api.signOut({ headers: requestHeaders });
  await recordAudit(getDb(), {
    actorType: "user",
    actorId: actor?.userId ?? null,
    action: "auth.logout",
    ipHash: requestContext(requestHeaders).ipHash,
  });
}
