"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { attachCompetencyAction, createCompetencyAction, createSubjectAreaAction, type DevFormState } from "./actions";

const select =
  "h-10 w-full border-2 border-border-default bg-bg px-3 text-sm hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

function useResetOnSuccess(state: DevFormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

function Status({ state, ok }: { state: DevFormState; ok: string }) {
  return (
    <p role="status" className="text-xs">
      {state.error ? <span className="text-danger">{state.error}</span> : state.ok ? ok : ""}
    </p>
  );
}

export function SubjectAreaForm() {
  const [state, submit, pending] = useActionState<DevFormState, FormData>(createSubjectAreaAction, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={submit} className="flex flex-col gap-3">
      <Field label="Neues Fachgebiet" hint="z. B. Security Operations, Softwareentwicklung">
        {(f) => <Input {...f} name="name" maxLength={80} required />}
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
        Fachgebiet anlegen
      </Button>
      <Status state={state} ok="Angelegt." />
    </form>
  );
}

export function CompetencyForm({ areas }: { areas: { id: string; name: string }[] }) {
  const [state, submit, pending] = useActionState<DevFormState, FormData>(createCompetencyAction, {});
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={submit} className="flex flex-col gap-3">
      <Field label="Neue Kompetenz" hint="z. B. Log-Analyse, Alert-Triage, TypeScript">
        {(f) => <Input {...f} name="name" maxLength={80} required />}
      </Field>
      <Field label="Fachgebiet">
        {(f) => (
          <select {...f} name="subjectAreaId" defaultValue="" className={select}>
            <option value="">Ohne Fachgebiet</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
        Kompetenz anlegen
      </Button>
      <Status state={state} ok="Angelegt." />
    </form>
  );
}

export function AttachCompetencyForm({
  reportId,
  options,
}: {
  reportId: string;
  options: { id: string; name: string }[];
}) {
  const [state, submit, pending] = useActionState<DevFormState, FormData>(attachCompetencyAction, {});
  const ref = useResetOnSuccess(state);
  if (options.length === 0) {
    return (
      <p className="text-xs text-text-secondary">
        Lege unter „Entwicklung“ Kompetenzen an, um sie hier als Beleg zuzuordnen.
      </p>
    );
  }
  return (
    <form ref={ref} action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <label htmlFor="attach-competency" className="text-xs text-text-secondary">
        Kompetenz
      </label>
      <select id="attach-competency" name="competencyId" required defaultValue="" className={select}>
        <option value="" disabled>
          Kompetenz wählen …
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <label htmlFor="attach-note" className="text-xs text-text-secondary">
        Was belegt dieser Report? (optional)
      </label>
      <Input id="attach-note" name="note" maxLength={300} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Als Beleg zuordnen
      </Button>
      <Status state={state} ok="Zugeordnet." />
    </form>
  );
}
