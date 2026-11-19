"use client";

import { useActionState } from "react";
import { FormError } from "@/ui/auth-frame";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { loginAction, type FormState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error} />
      <Field label="E-Mail-Adresse">
        {(p) => <Input {...p} name="email" type="email" autoComplete="username" required autoFocus />}
      </Field>
      <Field label="Passwort">
        {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? "Wird geprüft …" : "Anmelden"}
      </Button>
    </form>
  );
}
