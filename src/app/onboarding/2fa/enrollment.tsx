"use client";

import { useActionState } from "react";
import { FormError } from "@/ui/auth-frame";
import { Button } from "@/ui/button";
import { Meta } from "@/ui/card";
import { Field, Input } from "@/ui/field";
import { confirmEnrollmentAction, startEnrollmentAction, type ConfirmState, type EnrollmentState } from "./actions";

function groupSecret(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export function Enrollment() {
  const [start, startAction, starting] = useActionState<EnrollmentState, FormData>(startEnrollmentAction, {});
  const [confirm, confirmAction, confirming] = useActionState<ConfirmState, FormData>(confirmEnrollmentAction, {});

  if (!start.enrollment) {
    return (
      <form action={startAction} className="flex flex-col gap-5" noValidate>
        <FormError message={start.error} />
        <Field label="Passwort zur Bestätigung">
          {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required autoFocus />}
        </Field>
        <Button type="submit" disabled={starting} className="w-full">
          {starting ? "Wird vorbereitet …" : "Einrichtung starten"}
        </Button>
      </form>
    );
  }

  const { qrDataUrl, secret, backupCodes } = start.enrollment;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="enroll-scan" className="flex flex-col gap-3">
        <h2 id="enroll-scan" className="text-base font-semibold">
          1 · QR-Code scannen
        </h2>
        <p className="text-sm text-text-secondary">
          Mit einer Authenticator-App (z. B. Aegis, 2FAS, Google oder Microsoft Authenticator).
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- Data-URL, serverseitig erzeugt */}
        <img
          src={qrDataUrl}
          alt="QR-Code für die Authenticator-App"
          width={192}
          height={192}
          className="border-2 border-border-strong bg-white"
        />
        <div>
          <Meta>Manuelle Eingabe</Meta>
          <p data-testid="totp-secret" data-secret={secret} className="mt-1 break-all font-mono text-sm select-all">
            {groupSecret(secret)}
          </p>
        </div>
      </section>

      <section aria-labelledby="enroll-backup" className="flex flex-col gap-3">
        <h2 id="enroll-backup" className="text-base font-semibold">
          2 · Backup-Codes sichern
        </h2>
        <p className="text-sm text-text-secondary">
          Falls das Handy verloren geht. Jeder Code funktioniert einmal. Sie werden nur jetzt angezeigt – z. B. im
          Passwortmanager speichern.
        </p>
        <ul
          data-testid="backup-codes"
          className="grid grid-cols-2 gap-2 border-2 border-border-default bg-bg p-4 font-mono text-sm"
        >
          {backupCodes.map((code) => (
            <li key={code} className="select-all">
              {code}
            </li>
          ))}
        </ul>
      </section>

      <form action={confirmAction} className="flex flex-col gap-5" noValidate>
        <h2 className="text-base font-semibold">3 · Code bestätigen</h2>
        <FormError message={confirm.error} />
        <Field label="Aktueller Code aus der App">
          {(p) => (
            <Input
              {...p}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              className="font-mono tracking-[0.4em]"
            />
          )}
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="savedBackupCodes" className="mt-1 size-4 accent-[var(--accent)]" required />
          Ich habe die Backup-Codes sicher gespeichert.
        </label>
        <Button type="submit" disabled={confirming} className="w-full">
          {confirming ? "Wird geprüft …" : "Zwei-Faktor-Schutz aktivieren"}
        </Button>
      </form>
    </div>
  );
}
