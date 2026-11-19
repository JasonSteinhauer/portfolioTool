"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { regenerateBackupCodes, revokeOwnSession, signOut } from "@/modules/auth/service";
import { getCurrentSession, requireOwner } from "@/modules/auth/session";

export async function logoutAction(): Promise<void> {
  // Abmelden muss auch mit halb eingerichteter 2FA funktionieren → kein requireOwner().
  const session = await getCurrentSession();
  if (session) {
    await signOut({ type: "user", userId: session.user.id, role: "owner" }, await headers());
  }
  redirect("/login");
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const { actor, sessionId: currentId } = await requireOwner();
  const parsed = z.string().min(1).max(100).safeParse(formData.get("sessionId"));
  if (!parsed.success) return;

  await revokeOwnSession(actor, parsed.data, await headers());
  if (parsed.data === currentId) redirect("/login");
  revalidatePath("/app/settings");
}

export type BackupCodesState = { error?: string; backupCodes?: string[] };

export async function regenerateBackupCodesAction(
  _prev: BackupCodesState,
  formData: FormData,
): Promise<BackupCodesState> {
  const { actor } = await requireOwner();
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) return { error: "Bitte Passwort eingeben." };

  const result = await regenerateBackupCodes(actor, password, await headers());
  return result.ok ? { backupCodes: result.data.backupCodes } : { error: result.error };
}
