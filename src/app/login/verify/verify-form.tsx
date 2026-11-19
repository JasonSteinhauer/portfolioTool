"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/ui/auth-frame";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { verifyAction, type FormState } from "../actions";

export function VerifyForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(verifyAction, {});
  const [method, setMethod] = useState<"totp" | "backup">("totp");

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="method" value={method} />
      {method === "totp" ? (
        <Field label="Code aus der Authenticator-App" hint="Sechs Ziffern, ändert sich alle 30 Sekunden.">
          {(p) => (
            <Input
              {...p}
              key="totp"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              className="font-mono tracking-[0.4em]"
            />
          )}
        </Field>
      ) : (
        <Field label="Backup-Code" hint="Jeder Backup-Code funktioniert nur einmal.">
          {(p) => <Input {...p} key="backup" name="code" autoComplete="off" required autoFocus className="font-mono" />}
        </Field>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="trustDevice" className="mt-1 size-4 accent-[var(--accent)]" />
        <span>
          Diesem Gerät 30 Tage vertrauen
          <span className="block text-xs text-text-secondary">Nur auf eigenen Geräten aktivieren.</span>
        </span>
      </label>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Wird geprüft …" : "Bestätigen"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setMethod(method === "totp" ? "backup" : "totp")}>
        {method === "totp" ? "Stattdessen Backup-Code verwenden" : "Zurück zum App-Code"}
      </Button>
    </form>
  );
}
