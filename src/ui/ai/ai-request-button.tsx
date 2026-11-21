"use client";

import { useActionState } from "react";
import type { AiActionState } from "@/app/app/ai/actions";
import { Button } from "@/ui/button";

/** Startet einen KI-Auftrag (Server Action) und zeigt Sperren/Fehler direkt an. */
export function AiRequestButton({
  action,
  name,
  value,
  label,
  disabledReason,
}: {
  action: (state: AiActionState, formData: FormData) => Promise<AiActionState>;
  name: string;
  value: string;
  label: string;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending || Boolean(disabledReason)}>
        {pending ? "KI arbeitet …" : label}
      </Button>
      {disabledReason ? <p className="text-xs text-text-secondary">{disabledReason}</p> : null}
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
