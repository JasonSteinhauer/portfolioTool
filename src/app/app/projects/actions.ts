"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { addLink, removeLink } from "@/modules/links/service";
import {
  assignReportToProject,
  createProject,
  deleteProject,
  moveProject,
  updateProject,
} from "@/modules/projects/service";

const id = z.uuid();

export type ProjectFormState = { fieldErrors?: Record<string, string> };

function projectInput(formData: FormData) {
  const s = (k: string) => String(formData.get(k) ?? "");
  return {
    title: s("title"),
    summary: s("summary"),
    status: s("status"),
    startedOn: s("startedOn"),
    endedOn: s("endedOn"),
    parentProjectId: s("parentProjectId"),
  };
}

/** Pfad nur innerhalb des Arbeitsbereichs – verhindert offene Weiterleitungen. */
function safeReturn(value: FormDataEntryValue | null, fallback: string) {
  const v = typeof value === "string" ? value : "";
  return /^\/app(\/[\w\-/?=&.%]*)?$/.test(v) && !v.includes("//") ? v : fallback;
}

export async function createProjectAction(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const { actor } = await requireOwner();
  const result = await createProject(getDb(), actor, projectInput(formData));
  if (!result.ok) return { fieldErrors: result.fieldErrors };
  revalidatePath("/app/projects");
  redirect(`/app/projects/${result.id}`);
}

export async function updateProjectAction(_prev: ProjectFormState, formData: FormData): Promise<ProjectFormState> {
  const { actor } = await requireOwner();
  const projectId = id.parse(formData.get("projectId"));
  const result = await updateProject(getDb(), actor, projectId, projectInput(formData));
  if (!result.ok) return { fieldErrors: result.fieldErrors };
  revalidatePath("/app/projects");
  redirect(`/app/projects/${projectId}`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  await deleteProject(getDb(), actor, id.parse(formData.get("projectId")));
  revalidatePath("/app/projects");
  redirect("/app/projects");
}

export async function assignReportAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  const raw = String(formData.get("projectId") ?? "");
  const projectId = raw === "" ? null : id.parse(raw);
  await assignReportToProject(getDb(), actor, reportId, projectId);
  revalidatePath("/app/projects", "layout");
  revalidatePath(`/app/reports/${reportId}`);
  redirect(safeReturn(formData.get("returnTo"), `/app/reports/${reportId}`));
}

export type LinkFormState = { error?: string; ok?: boolean };

/**
 * Verknüpft zwei Reports. `direction`: `buildsOn` = dieser Report baut auf dem gewählten auf,
 * `leadsTo` = der gewählte baut auf diesem auf.
 */
export async function addLinkAction(_prev: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  const otherRaw = String(formData.get("otherId") ?? "");
  if (!id.safeParse(otherRaw).success) return { error: "Bitte einen Report auswählen." };
  const direction = z.enum(["buildsOn", "leadsTo"]).parse(formData.get("direction"));
  const [source, target] = direction === "buildsOn" ? [otherRaw, reportId] : [reportId, otherRaw];
  const result = await addLink(getDb(), actor, source, target);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/app/reports/${reportId}`);
  revalidatePath(`/app/reports/${otherRaw}`);
  revalidatePath("/app/projects", "layout");
  return { ok: true };
}

export async function removeLinkAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const source = id.parse(formData.get("sourceId"));
  const target = id.parse(formData.get("targetId"));
  await removeLink(getDb(), actor, source, target);
  revalidatePath(`/app/reports/${source}`);
  revalidatePath(`/app/reports/${target}`);
  revalidatePath("/app/projects", "layout");
  redirect(safeReturn(formData.get("returnTo"), `/app/reports/${target}`));
}

export async function moveProjectAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const dir = formData.get("dir") === "up" ? -1 : 1;
  await moveProject(getDb(), actor, id.parse(formData.get("projectId")), dir);
  revalidatePath("/app/projects", "layout");
}
