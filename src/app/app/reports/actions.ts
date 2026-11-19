"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import {
  createReport,
  finalizeReport,
  moveToTrash,
  restoreFromTrash,
  restoreVersion,
  saveReport,
  type SaveResult,
} from "@/modules/reports/service";

const id = z.uuid();

export async function createReportAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const typeKey = z.string().min(1).max(40).parse(formData.get("typeKey"));
  const report = await createReport(getDb(), actor, { typeKey });
  redirect(`/app/reports/${report.id}/edit`);
}

/** Autosave und manuelles Speichern. Liefert strukturierte Ergebnisse statt Exceptions. */
export async function saveReportAction(
  reportId: string,
  payload: unknown,
): Promise<SaveResult | { ok: false; reason: "error" }> {
  const { actor } = await requireOwner();
  if (!id.safeParse(reportId).success) return { ok: false, reason: "error" };
  try {
    const result = await saveReport(getDb(), actor, reportId, payload);
    if (result.ok) revalidatePath(`/app/reports/${reportId}`);
    return result;
  } catch {
    return { ok: false, reason: "error" };
  }
}

export type FinalizeState = { fieldErrors?: Record<string, string> };

export async function finalizeReportAction(_prev: FinalizeState, formData: FormData): Promise<FinalizeState> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  const result = await finalizeReport(getDb(), actor, reportId);
  if (!result.ok) return { fieldErrors: result.fieldErrors };
  revalidatePath(`/app/reports/${reportId}`);
  redirect(`/app/reports/${reportId}`);
}

export async function trashReportAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  await moveToTrash(getDb(), actor, id.parse(formData.get("reportId")));
  revalidatePath("/app/reports");
  redirect("/app/reports");
}

export async function restoreReportAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  await restoreFromTrash(getDb(), actor, reportId);
  revalidatePath("/app/reports");
  redirect(`/app/reports/${reportId}`);
}

export async function restoreVersionAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  await restoreVersion(getDb(), actor, reportId, id.parse(formData.get("versionId")));
  revalidatePath(`/app/reports/${reportId}`);
  redirect(`/app/reports/${reportId}/edit`);
}
