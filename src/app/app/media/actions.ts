"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { MediaInUseError, moveMediaToTrash, restoreMedia, updateMedia } from "@/modules/media/service";

const id = z.uuid();

export type MediaFormState = { saved?: boolean; error?: string };

export async function updateMediaAction(_prev: MediaFormState, formData: FormData): Promise<MediaFormState> {
  const { actor } = await requireOwner();
  const mediaId = id.parse(formData.get("mediaId"));
  const parsed = z
    .object({ title: z.string().max(200), altText: z.string().max(300) })
    .safeParse({ title: formData.get("title") ?? "", altText: formData.get("altText") ?? "" });
  if (!parsed.success) return { error: "Titel max. 200, Beschreibung max. 300 Zeichen." };
  await updateMedia(getDb(), actor, mediaId, parsed.data);
  revalidatePath("/app/media");
  revalidatePath(`/app/media/${mediaId}`);
  return { saved: true };
}

export async function trashMediaAction(_prev: MediaFormState, formData: FormData): Promise<MediaFormState> {
  const { actor } = await requireOwner();
  const mediaId = id.parse(formData.get("mediaId"));
  try {
    await moveMediaToTrash(getDb(), actor, mediaId);
  } catch (error) {
    if (error instanceof MediaInUseError) {
      return { error: `Wird noch verwendet in: ${error.reports.map((r) => r.title).join(", ")}. Erst dort entfernen.` };
    }
    throw error;
  }
  revalidatePath("/app/media");
  redirect("/app/media");
}

export async function restoreMediaAction(formData: FormData): Promise<void> {
  const { actor } = await requireOwner();
  await restoreMedia(getDb(), actor, id.parse(formData.get("mediaId")));
  revalidatePath("/app/media");
}
