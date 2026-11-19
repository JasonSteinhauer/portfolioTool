"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { confirmTwoFactorEnrollment, startTwoFactorEnrollment, type Enrollment } from "@/modules/auth/service";
import { requireSession } from "@/modules/auth/session";

export type EnrollmentState = { error?: string; enrollment?: Enrollment };

export async function startEnrollmentAction(_prev: EnrollmentState, formData: FormData): Promise<EnrollmentState> {
  const session = await requireSession();
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) return { error: "Bitte Passwort eingeben." };

  const result = await startTwoFactorEnrollment(session.user.id, password, await headers());
  return result.ok ? { enrollment: result.data } : { error: result.error };
}

export type ConfirmState = { error?: string };

export async function confirmEnrollmentAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const session = await requireSession();
  if (formData.get("savedBackupCodes") !== "on") {
    return { error: "Bitte bestätige, dass du die Backup-Codes sicher aufbewahrt hast." };
  }
  const result = await confirmTwoFactorEnrollment(session.user.id, String(formData.get("code") ?? ""), await headers());
  if (!result.ok) return { error: result.error };
  redirect("/app");
}
