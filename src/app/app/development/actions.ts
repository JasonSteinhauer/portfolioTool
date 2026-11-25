"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import {
  attachCompetency,
  createCompetency,
  createSubjectArea,
  deleteCompetency,
  deleteSubjectArea,
  detachCompetency,
} from "@/modules/development/service";

export type DevFormState = { error?: string; ok?: boolean };
const id = z.uuid();

export async function createSubjectAreaAction(_prev: DevFormState, formData: FormData): Promise<DevFormState> {
  const { actor } = await requireOwner();
  const result = await createSubjectArea(getDb(), actor, {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/app/development");
  return { ok: true };
}

export async function createCompetencyAction(_prev: DevFormState, formData: FormData): Promise<DevFormState> {
  const { actor } = await requireOwner();
  const result = await createCompetency(getDb(), actor, {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    subjectAreaId: String(formData.get("subjectAreaId") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/app/development");
  return { ok: true };
}

export async function deleteCompetencyAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  await deleteCompetency(getDb(), actor, String(formData.get("competencyId") ?? ""));
  revalidatePath("/app/development");
}

export async function deleteSubjectAreaAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  await deleteSubjectArea(getDb(), actor, String(formData.get("subjectAreaId") ?? ""));
  revalidatePath("/app/development");
}

export async function attachCompetencyAction(_prev: DevFormState, formData: FormData): Promise<DevFormState> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  const result = await attachCompetency(
    getDb(),
    actor,
    reportId,
    String(formData.get("competencyId") ?? ""),
    String(formData.get("note") ?? ""),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(`/app/reports/${reportId}`);
  revalidatePath("/app/development");
  return { ok: true };
}

export async function detachCompetencyAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  await detachCompetency(getDb(), actor, reportId, String(formData.get("competencyId") ?? ""));
  revalidatePath(`/app/reports/${reportId}`);
  revalidatePath("/app/development");
}
