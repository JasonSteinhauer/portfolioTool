import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/server-env";
import { getDb } from "@/lib/db/client";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getClientIp, hashIdentifier } from "@/lib/security/request";
import { resolveShareToken } from "@/modules/sharing/service";
import { VIEW_COOKIE, VIEW_COOKIE_PATH } from "@/modules/sharing/viewer";

/**
 * Einstieg über einen Freigabelink. Prüft das Token, legt es in ein HttpOnly-Cookie (nur Pfad /p)
 * und leitet auf eine URL OHNE Token weiter – so landet es weder im Verlauf noch im Referer.
 */
const MAX_COOKIE_AGE_SECONDS = 60 * 60 * 24 * 30;
const NOT_FOUND = new Response("Dieser Link ist ungültig, abgelaufen oder wurde widerrufen.", {
  status: 404,
  headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store" },
});

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const env = serverEnv();
  const db = getDb();
  const ipHash = hashIdentifier(env.BETTER_AUTH_SECRET, getClientIp(request.headers));
  const limit = await consumeRateLimit(db, `share:ip:${ipHash}`, { limit: 30, windowMs: 15 * 60_000 });
  if (!limit.allowed) return NOT_FOUND.clone();

  const { token } = await params;
  const link = await resolveShareToken(db, token, { countAccess: true });
  if (!link) return NOT_FOUND.clone();

  const [row] = await db.query.shareLinks.findMany({
    where: (l, { eq }) => eq(l.id, link.id),
    columns: { expiresAt: true },
  });
  const secondsLeft = row?.expiresAt
    ? Math.floor((row.expiresAt.getTime() - Date.now()) / 1000)
    : MAX_COOKIE_AGE_SECONDS;

  const response = NextResponse.redirect(new URL("/p", env.APP_URL), 303);
  response.cookies.set(VIEW_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: VIEW_COOKIE_PATH,
    maxAge: Math.max(60, Math.min(secondsLeft, MAX_COOKIE_AGE_SECONDS)),
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-robots-tag", "noindex");
  return response;
}
