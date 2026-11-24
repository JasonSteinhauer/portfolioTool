"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { decideComposition, requestComposition } from "@/modules/ai/compose";
import { AiBlockedError, AiJobFailedError, AiUnavailableError } from "@/modules/ai/gateway";
import { decideLanguageProposals, requestLanguageSuggestions } from "@/modules/ai/language";
import { aiRuntime } from "@/modules/ai/runtime";
import { requireOwner } from "@/modules/auth/session";

export type AiActionState = { error?: string; notice?: string };

const id = z.uuid();

function messageFor(error: unknown): string | null {
  if (error instanceof AiUnavailableError) return "KI ist nicht eingerichtet (AI_PROVIDER in der Konfiguration).";
  if (error instanceof AiBlockedError) return error.message;
  if (error instanceof AiJobFailedError) return `${error.message} Es wurde nichts geändert.`;
  return null;
}

export async function requestLanguageAction(_prev: AiActionState, formData: FormData): Promise<AiActionState> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  const { config, provider } = aiRuntime();
  try {
    await requestLanguageSuggestions({ db: getDb(), actor, provider, config }, reportId);
  } catch (error) {
    const message = messageFor(error);
    if (message) return { error: message };
    throw error;
  }
  redirect(`/app/reports/${reportId}/ai`);
}

export async function decideLanguageAction(_prev: AiActionState, formData: FormData): Promise<AiActionState> {
  const { actor } = await requireOwner();
  const reportId = id.parse(formData.get("reportId"));
  const all = formData.getAll("proposalId").map((v) => id.parse(v));
  const selected = new Set(formData.getAll("accept").map((v) => id.parse(v)));
  const rejectAll = formData.get("intent") === "reject";
  const result = await decideLanguageProposals(getDb(), actor, reportId, {
    accept: rejectAll ? [] : all.filter((p) => selected.has(p)),
    reject: rejectAll ? all : all.filter((p) => !selected.has(p)),
  });
  revalidatePath(`/app/reports/${reportId}`);
  if (!result.ok) {
    return { error: "Der Report wurde zwischenzeitlich geändert. Bitte die Vorschläge neu erzeugen." };
  }
  const parts = [
    result.accepted ? `${result.accepted} übernommen` : "",
    result.rejected ? `${result.rejected} verworfen` : "",
    result.stale ? `${result.stale} überholt (Text inzwischen geändert)` : "",
  ].filter(Boolean);
  return { notice: parts.join(", ") || "Nichts ausgewählt." };
}

export async function requestCompositionAction(_prev: AiActionState, formData: FormData): Promise<AiActionState> {
  const { actor } = await requireOwner();
  const pageId = id.parse(formData.get("pageId"));
  const { config, provider } = aiRuntime();
  try {
    await requestComposition({ db: getDb(), actor, provider, config }, pageId);
  } catch (error) {
    const message = messageFor(error);
    if (message) return { error: message };
    throw error;
  }
  redirect(`/app/portfolio/${pageId}/ai`);
}

export async function decideCompositionAction(_prev: AiActionState, formData: FormData): Promise<AiActionState> {
  const { actor } = await requireOwner();
  const pageId = id.parse(formData.get("pageId"));
  const proposalId = id.parse(formData.get("proposalId"));
  const decision = formData.get("intent") === "accept" ? "accept" : "reject";
  const result = await decideComposition(getDb(), actor, pageId, proposalId, decision);
  if (!result.ok) {
    return {
      error:
        result.reason === "stale"
          ? "Die Seite wurde seit dem KI-Auftrag geändert – der Entwurf ist überholt. Bitte neu erzeugen."
          : "Der Entwurf konnte nicht übernommen werden.",
    };
  }
  revalidatePath(`/app/portfolio/${pageId}`);
  redirect(`/app/portfolio/${pageId}`);
}
