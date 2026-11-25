"use client";

import { useActionState } from "react";
import { Button } from "@/ui/button";
import { addLinkAction, type LinkFormState } from "../../projects/actions";

const select =
  "h-10 w-full min-w-0 border-2 border-border-default bg-bg px-3 text-sm hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

export function LinkForm({ reportId, options }: { reportId: string; options: { id: string; title: string }[] }) {
  const [state, submit, pending] = useActionState<LinkFormState, FormData>(addLinkAction, {});
  return (
    <form action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <label htmlFor="link-direction" className="text-xs text-text-secondary">
        Beziehung
      </label>
      <select id="link-direction" name="direction" defaultValue="buildsOn" className={select}>
        <option value="buildsOn">Dieser Report baut auf …</option>
        <option value="leadsTo">Dieser Report führt zu …</option>
      </select>
      <label htmlFor="link-other" className="text-xs text-text-secondary">
        Report
      </label>
      <select id="link-other" name="otherId" required className={select} defaultValue="">
        <option value="" disabled>
          Report wählen …
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Verknüpfen
      </Button>
      <p role="status" className="text-xs">
        {state.error ? <span className="text-danger">{state.error}</span> : state.ok ? "Verknüpft." : ""}
      </p>
    </form>
  );
}
