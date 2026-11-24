"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/config/server-env";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import {
  addToShowcase,
  createPageFromReport,
  moveInShowcase,
  publishPage,
  publishProfile,
  PublishBlockedError,
  removeFromShowcase,
  savePage,
  saveProfile,
  toggleFavorite,
  unpublishPage,
  type SavePageResult,
} from "@/modules/portfolio/service";
import { createShareLink, revokeShareLink } from "@/modules/sharing/service";

const id = z.uuid();

export async function createPageFromReportAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const page = await createPageFromReport(getDb(), actor, id.parse(formData.get("reportId")));
  redirect(`/app/portfolio/${page.id}`);
}

export async function toggleFavoriteAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const itemType = z.enum(["report", "page"]).parse(formData.get("itemType"));
  await toggleFavorite(getDb(), actor, itemType, id.parse(formData.get("itemId")));
  const back = z
    .string()
    .regex(/^\/app\/[\w/-]*$/)
    .safeParse(formData.get("returnTo"));
  revalidatePath(back.success ? back.data : "/app/portfolio");
}

export async function savePageAction(pageId: string, payload: unknown): Promise<SavePageResult> {
  const { actor } = await requireOwner();
  const result = await savePage(getDb(), actor, id.parse(pageId), payload);
  if (result.ok) revalidatePath(`/app/portfolio/${pageId}`);
  return result;
}

export type PublishState = { error?: string; published?: number };

export async function publishPageAction(_prev: PublishState, formData: FormData): Promise<PublishState> {
  const { actor } = await requireOwner();
  const pageId = id.parse(formData.get("pageId"));
  try {
    const snapshot = await publishPage(getDb(), actor, pageId);
    revalidatePath(`/app/portfolio/${pageId}`);
    revalidatePath("/app/portfolio");
    return { published: snapshot.versionNo };
  } catch (error) {
    if (error instanceof PublishBlockedError) return { error: error.message };
    throw error;
  }
}

export async function unpublishPageAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const pageId = id.parse(formData.get("pageId"));
  await unpublishPage(getDb(), actor, pageId);
  revalidatePath(`/app/portfolio/${pageId}`);
}

export async function showcaseAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  const db = getDb();
  const pageId = id.parse(formData.get("pageId"));
  switch (z.enum(["add", "remove", "up", "down"]).parse(formData.get("op"))) {
    case "add":
      await addToShowcase(db, actor, pageId);
      break;
    case "remove":
      await removeFromShowcase(db, actor, pageId);
      break;
    case "up":
      await moveInShowcase(db, actor, pageId, -1);
      break;
    case "down":
      await moveInShowcase(db, actor, pageId, 1);
      break;
  }
  revalidatePath("/app/portfolio");
}

export async function saveProfileAction(payload: unknown): Promise<SavePageResult> {
  const { actor } = await requireOwner();
  const result = await saveProfile(getDb(), actor, payload);
  if (result.ok) revalidatePath("/app/portfolio/profile");
  return result;
}

export async function publishProfileAction(): Promise<{ version: number }> {
  const { actor } = await requireOwner();
  const snapshot = await publishProfile(getDb(), actor);
  revalidatePath("/app/portfolio/profile");
  return { version: snapshot.versionNo };
}

export type ShareState = { error?: string; url?: string };

export async function createShareLinkAction(_prev: ShareState, formData: FormData): Promise<ShareState> {
  const { actor } = await requireOwner();
  const scope = String(formData.get("scope") ?? "");
  const days = Number(formData.get("expiresInDays") ?? 0);
  const input =
    scope === "showcase"
      ? { scopeType: "showcase", label: formData.get("label"), expiresInDays: days > 0 ? days : null }
      : { scopeType: "page", scopeId: scope, label: formData.get("label"), expiresInDays: days > 0 ? days : null };
  try {
    const { token } = await createShareLink(getDb(), actor, input);
    const host = (await headers()).get("host");
    const base = serverEnv().APP_URL || (host ? `https://${host}` : "");
    revalidatePath("/app/portfolio/sharing");
    return { url: `${base}/s/${token}` };
  } catch {
    return { error: "Link konnte nicht erstellt werden. Bitte Bezeichnung und Umfang prüfen." };
  }
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  await revokeShareLink(getDb(), actor, String(formData.get("linkId")));
  revalidatePath("/app/portfolio/sharing");
}
