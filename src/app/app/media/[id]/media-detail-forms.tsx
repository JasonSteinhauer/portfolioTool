"use client";

import { useActionState } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import { trashMediaAction, updateMediaAction, type MediaFormState } from "../actions";

export function MediaDetailForms(props: { mediaId: string; isImage: boolean; title: string; altText: string }) {
  const [state, save, saving] = useActionState<MediaFormState, FormData>(updateMediaAction, {});
  const [trashState, trash, trashing] = useActionState<MediaFormState, FormData>(trashMediaAction, {});

  return (
    <>
      <form action={save} className="flex flex-col gap-4">
        <input type="hidden" name="mediaId" value={props.mediaId} />
        <Field label="Titel">{(f) => <Input {...f} name="title" defaultValue={props.title} maxLength={200} />}</Field>
        {props.isImage ? (
          <Field
            label="Bildbeschreibung (Alt-Text)"
            hint="Beschreibt das Bild für Screenreader. Wird als Vorschlag in neue Bild-Blöcke übernommen."
          >
            {(f) => (
              <Textarea {...f} name="altText" defaultValue={props.altText} maxLength={300} className="min-h-20" />
            )}
          </Field>
        ) : (
          <input type="hidden" name="altText" value="" />
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            Speichern
          </Button>
          <span role="status" className="font-mono text-xs text-text-secondary">
            {state.saved ? "Gespeichert" : (state.error ?? "")}
          </span>
        </div>
      </form>
      <form action={trash} className="flex flex-col gap-2">
        <input type="hidden" name="mediaId" value={props.mediaId} />
        <Button type="submit" variant="danger" size="sm" disabled={trashing} className="self-start">
          In den Papierkorb
        </Button>
        {trashState.error ? (
          <p role="alert" className="text-sm text-danger">
            {trashState.error}
          </p>
        ) : null}
      </form>
    </>
  );
}
