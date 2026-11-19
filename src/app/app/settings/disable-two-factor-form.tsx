"use client";

import { useActionState } from "react";
import { FormError } from "@/ui/auth-frame";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { disableTwoFactorAction, type DisableTwoFactorState } from "../actions";

export function DisableTwoFactorForm() {
  const [state, action, pending] = useActionState<DisableTwoFactorState, FormData>(disableTwoFactorAction, {});
  return (
    <form action={action} className="flex max-w-sm flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field label="Passwort zum Ausschalten">
        {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Wird ausgeschaltet …" : "Zwei-Faktor-Schutz ausschalten"}
      </Button>
    </form>
  );
}
