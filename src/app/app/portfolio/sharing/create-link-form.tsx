"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/ui/auth-frame";
import { Button } from "@/ui/button";
import { createShareLinkAction, type ShareState } from "../actions";

const control =
  "w-full border-2 border-border-default bg-bg px-3 text-sm text-text-primary hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

export function CreateLinkForm({ pages }: { pages: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<ShareState, FormData>(createShareLinkAction, {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_auto] md:items-end">
        <label className="flex flex-col gap-2 text-[13px] font-medium">
          Bezeichnung
          <input
            name="label"
            required
            maxLength={80}
            placeholder="z. B. Bewerbung Firma X"
            className={`${control} h-10 font-normal`}
          />
        </label>
        <label className="flex flex-col gap-2 text-[13px] font-medium">
          Umfang
          <select name="scope" defaultValue="showcase" className={`${control} h-10 font-normal`}>
            <option value="showcase">Showcase (Profil + ausgewählte Seiten)</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                Nur: {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-[13px] font-medium">
          Gültig für
          <select name="expiresInDays" defaultValue="30" className={`${control} h-10 font-normal`}>
            <option value="7">7 Tage</option>
            <option value="30">30 Tage</option>
            <option value="90">90 Tage</option>
            <option value="0">unbegrenzt</option>
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          Link erstellen
        </Button>
      </form>
      <FormError message={state.error} />
      {state.url ? (
        <div role="status" className="flex flex-col gap-2 border-2 border-accent bg-surface p-4">
          <p className="text-sm">Neuer Link – er wird nur jetzt angezeigt. Kopieren und weitergeben:</p>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={state.url}
              data-testid="new-share-url"
              aria-label="Freigabelink"
              className={`${control} h-10 min-w-0 flex-1 font-mono`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(state.url!);
                setCopied(true);
              }}
            >
              {copied ? "Kopiert" : "Kopieren"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
