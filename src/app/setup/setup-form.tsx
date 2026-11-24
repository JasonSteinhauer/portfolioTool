"use client";

import { useActionState } from "react";
import { FormError } from "@/ui/auth-frame";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { setupAction, type SetupState } from "./actions";

export function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(setupAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error} />
      <Field label="Einrichtungsschlüssel" hint="Der Wert von SETUP_TOKEN aus den Vercel-Einstellungen.">
        {(p) => <Input {...p} name="token" type="password" autoComplete="off" required autoFocus />}
      </Field>
      <Field label="Name">{(p) => <Input {...p} name="name" autoComplete="name" required />}</Field>
      <Field label="E-Mail-Adresse">
        {(p) => <Input {...p} name="email" type="email" autoComplete="username" required />}
      </Field>
      <Field label="Passwort" hint="Mindestens 12 Zeichen – ein langer Satz ist ideal.">
        {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" required />}
      </Field>
      <Field label="Passwort wiederholen">
        {(p) => <Input {...p} name="passwordRepeat" type="password" autoComplete="new-password" required />}
      </Field>
      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "Wird eingerichtet …" : "Konto anlegen"}
      </Button>
    </form>
  );
}
