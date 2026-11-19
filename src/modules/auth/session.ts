import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Actor } from "./policy";
import { getAuth } from "./server";

/**
 * Data-Access-Layer für die Authentifizierung.
 *
 * Regeln:
 * - Jede geschützte Seite UND jede Server Action ruft `requireOwner()` selbst auf.
 *   Layouts allein reichen nicht (sie werden bei Client-Navigation nicht neu ausgeführt).
 * - `cache()` sorgt dafür, dass pro Request nur einmal gegen die DB geprüft wird.
 */

export const getCurrentSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
};

/** Angemeldet (ohne Rollenprüfung) – für die 2FA-Einrichtung. */
export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

/** Angemeldeter Owner. 2FA ist optional (Entscheidung des Owners, siehe ADR 0004). */
export async function requireOwner(): Promise<{ actor: Actor; user: CurrentUser; sessionId: string }> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const user = session.user as typeof session.user & { role?: string | null; twoFactorEnabled?: boolean | null };
  if (user.role !== "owner") redirect("/login");

  return {
    actor: { type: "user", userId: user.id, role: "owner" },
    user: { id: user.id, name: user.name, email: user.email, twoFactorEnabled: Boolean(user.twoFactorEnabled) },
    sessionId: session.session.id,
  };
}

/**
 * Für Route Handler (API): liefert den Owner oder `null` – ohne Redirect.
 * Aufrufer antworten dann mit 401.
 */
export async function getOwner(): Promise<{ actor: Actor } | null> {
  const session = await getCurrentSession();
  const role = (session?.user as { role?: string | null } | undefined)?.role;
  if (!session || role !== "owner") return null;
  return { actor: { type: "user", userId: session.user.id, role: "owner" } };
}
