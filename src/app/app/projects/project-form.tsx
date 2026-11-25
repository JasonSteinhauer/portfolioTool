"use client";

import { useActionState } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import type { ProjectFormState } from "./actions";

const STATUS = [
  ["active", "Aktiv"],
  ["planned", "Geplant"],
  ["paused", "Pausiert"],
  ["completed", "Abgeschlossen"],
] as const;

const select =
  "h-10 w-full border-2 border-border-default bg-bg px-3 text-sm hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

export function ProjectForm({
  action,
  project,
  parents,
  defaultParentId,
  submitLabel,
}: {
  action: (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  project?: {
    id: string;
    title: string;
    summary: string | null;
    status: string;
    startedOn: string | null;
    endedOn: string | null;
    parentProjectId: string | null;
  };
  /** Mögliche Elternprojekte (bereits ohne das Projekt selbst und seine Unterprojekte), mit Ebene. */
  parents: { id: string; title: string; depth: number }[];
  defaultParentId?: string;
  submitLabel: string;
}) {
  const [state, submit, pending] = useActionState<ProjectFormState, FormData>(action, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={submit} className="flex max-w-2xl flex-col gap-5" noValidate>
      {project ? <input type="hidden" name="projectId" value={project.id} /> : null}
      <Field label="Titel" required error={e.title}>
        {(f) => (
          <Input {...f} name="title" defaultValue={project?.title} maxLength={160} required autoFocus={!project} />
        )}
      </Field>
      <Field label="Kurzbeschreibung" hint="Worum geht es? Ein bis drei Sätze." error={e.summary}>
        {(f) => <Textarea {...f} name="summary" defaultValue={project?.summary ?? ""} maxLength={2000} />}
      </Field>
      <Field
        label="Übergeordnetes Projekt"
        hint="Optional – für Unterprojekte (höchstens 3 Ebenen)."
        error={e.parentProjectId}
      >
        {(f) => (
          <select
            {...f}
            name="parentProjectId"
            defaultValue={project?.parentProjectId ?? defaultParentId ?? ""}
            className={select}
          >
            <option value="">– keines (oberste Ebene) –</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {"— ".repeat(p.depth - 1)}
                {p.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Status" error={e.status}>
          {(f) => (
            <select {...f} name="status" defaultValue={project?.status ?? "active"} className={select}>
              {STATUS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Start" error={e.startedOn}>
          {(f) => <Input {...f} type="date" name="startedOn" defaultValue={project?.startedOn ?? ""} />}
        </Field>
        <Field label="Ende" error={e.endedOn}>
          {(f) => <Input {...f} type="date" name="endedOn" defaultValue={project?.endedOn ?? ""} />}
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
