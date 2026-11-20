import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { sameOrigin } from "@/lib/security/same-origin";
import { getOwner } from "@/modules/auth/session";
import { ReportNotFoundError, saveReport } from "@/modules/reports/service";

/**
 * Speichert einen Report. Wird vom Editor beim Verlassen (Tab-Wechsel, Schließen, Navigation)
 * per `fetch(…, { keepalive: true })` aufgerufen – Server Actions kommen beim Schließen nicht
 * zuverlässig an.
 *
 * Schutz: nur Same-Origin (CSRF), nur JSON, Größenlimit, Owner-Session, Validierung im Service.
 */
const MAX_BODY_BYTES = 1_200_000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ ok: false, reason: "unsupported" }, { status: 415 });
  }

  const owner = await getOwner();
  if (!owner) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, reason: "too_large" }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid", fieldErrors: { _: "Ungültiges JSON" } }, { status: 400 });
  }

  try {
    const result = await saveReport(getDb(), owner.actor, id, payload);
    const status = result.ok ? 200 : result.reason === "conflict" ? 409 : 422;
    return NextResponse.json(result, { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ReportNotFoundError)
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    throw error;
  }
}
