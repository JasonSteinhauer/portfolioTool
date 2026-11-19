import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { resolveShareToken, type ResolvedLink } from "./service";

/** Cookie mit dem Freigabe-Token – nur für den Pfad /p gültig, nie für /app oder /api. */
export const VIEW_COOKIE = "dp_view";
export const VIEW_COOKIE_PATH = "/p";

/**
 * Prüft bei JEDEM Viewer-Request den Link neu (Widerruf/Ablauf wirken sofort).
 * Jede Seite unter /p muss diese Funktion aufrufen (per Test erzwungen).
 */
export async function getViewerLink(): Promise<ResolvedLink | null> {
  const token = (await cookies()).get(VIEW_COOKIE)?.value;
  return resolveShareToken(getDb(), token);
}
