"use client";

import { useActionState } from "react";
import { FormError } from "@/ui/auth-frame";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { regenerateBackupCodesAction, type BackupCodesState } from "../actions";

export function BackupCodesForm() {
  const [state, action, pending] = useActionState<BackupCodesState, FormData>(regenerateBackupCodesAction, {});

  if (state.backupCodes) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text-secondary">
          Neue Backup-Codes – die alten sind ab sofort ungültig. Sie werden nur jetzt angezeigt.
        </p>
        <ul className="grid grid-cols-2 gap-2 border-2 border-border-default bg-bg p-4 font-mono text-sm sm:grid-cols-5">
          {state.backupCodes.map((code) => (
            <li key={code} className="select-all">
              {code}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form action={action} className="flex max-w-sm flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field label="Passwort zur Bestätigung">
        {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Wird erzeugt …" : "Neue Backup-Codes erzeugen"}
      </Button>
    </form>
  );
}
