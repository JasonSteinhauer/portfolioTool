"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentView } from "@/content/blocks/render";
import type { Block, ContentDocument } from "@/content/blocks/schema";
import type { FieldDefinition } from "@/modules/reports/report-types";
import type { Classification } from "@/modules/reports/service";
import { Button } from "@/ui/button";
import { Meta } from "@/ui/card";
import { cn } from "@/ui/cn";
import { saveReportAction } from "../../actions";
import { AddBlockMenu, BlockEditor, createBlock } from "./block-editor";

export type EditorInitial = {
  title: string;
  structuredFields: Record<string, unknown>;
  content: ContentDocument;
  classification: Classification;
  aiAllowed: boolean;
  revision: number;
  status: "draft" | "final" | "archived";
};

type Draft = Omit<EditorInitial, "revision" | "status">;

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "invalid" }
  | { kind: "conflict" }
  | { kind: "error"; retryInMs: number };

export const AUTOSAVE_DELAY_MS = 1200;
const control =
  "w-full border-2 border-border-default bg-bg px-3 text-sm text-text-primary placeholder:text-text-secondary/70 hover:border-border-strong focus-visible:border-accent focus-visible:outline-none aria-[invalid=true]:border-danger";

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  private: "Privat",
  internal_sensitive: "Intern / sensibel (Firma)",
  publishable: "Veröffentlichbar",
};

const timeFormat = new Intl.DateTimeFormat("de-DE", { timeStyle: "short" });

export function ReportEditor({
  reportId,
  typeName,
  fieldSchema,
  initial,
}: {
  reportId: string;
  typeName: string;
  fieldSchema: FieldDefinition[];
  initial: EditorInitial;
}) {
  const [draft, setDraft] = useState<Draft>({
    title: initial.title,
    structuredFields: initial.structuredFields,
    content: initial.content,
    classification: initial.classification,
    aiAllowed: initial.aiAllowed,
  });
  const [status, setStatus] = useState(initial.status);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string>();
  const [preview, setPreview] = useState(false);

  const revision = useRef(initial.revision);
  const latest = useRef(draft);
  const changeCounter = useRef(0);
  const savedCounter = useRef(0);
  const inFlight = useRef(false);
  const blocked = useRef(false);

  useEffect(() => {
    latest.current = draft;
  }, [draft]);

  const update = useCallback((patch: Partial<Draft> | ((d: Draft) => Draft)) => {
    setDraft((current) => (typeof patch === "function" ? patch(current) : { ...current, ...patch }));
    changeCounter.current += 1;
    setSave((s) => (s.kind === "conflict" ? s : { kind: "dirty" }));
  }, []);

  const persist = useCallback(
    async (manual: boolean) => {
      if (inFlight.current || blocked.current) return;
      inFlight.current = true;
      const counterAtStart = changeCounter.current;
      setSave({ kind: "saving" });
      try {
        const result = await saveReportAction(reportId, { ...latest.current, revision: revision.current, manual });
        if (result.ok) {
          revision.current = result.revision;
          savedCounter.current = counterAtStart;
          setErrors({});
          setStatus(result.status);
          if (result.reopened) setNotice("Pflichtfelder fehlen – der Report ist wieder ein Entwurf.");
          setSave(
            changeCounter.current === counterAtStart
              ? { kind: "saved", at: new Date(result.savedAt) }
              : { kind: "dirty" },
          );
        } else if (result.reason === "conflict") {
          blocked.current = true;
          setSave({ kind: "conflict" });
        } else if (result.reason === "invalid") {
          setErrors(result.fieldErrors);
          savedCounter.current = counterAtStart;
          setSave({ kind: "invalid" });
        } else {
          setSave({ kind: "error", retryInMs: 5000 });
        }
      } catch {
        setSave({ kind: "error", retryInMs: 5000 });
      } finally {
        inFlight.current = false;
      }
    },
    [reportId],
  );

  // Autosave: kurz nach der letzten Änderung speichern.
  useEffect(() => {
    if (save.kind !== "dirty") return;
    const timer = setTimeout(() => void persist(false), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [save, draft, persist]);

  // Bei Fehlern automatisch erneut versuchen.
  useEffect(() => {
    if (save.kind !== "error") return;
    const timer = setTimeout(() => void persist(false), save.retryInMs);
    return () => clearTimeout(timer);
  }, [save, persist]);

  // Warnung beim Verlassen mit ungespeicherten Änderungen.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (changeCounter.current !== savedCounter.current || inFlight.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const setBlocks = (fn: (blocks: Block[]) => Block[]) =>
    update((d) => ({ ...d, content: { ...d.content, blocks: fn(d.content.blocks) } }));
  const setField = (key: string, value: unknown) =>
    update((d) => ({ ...d, structuredFields: { ...d.structuredFields, [key]: value } }));

  const blockErrors = Object.entries(errors).reduce<Record<number, string>>((acc, [key, message]) => {
    const match = /^content\.blocks\.(\d+)/.exec(key);
    if (match) acc[Number(match[1])] ??= message;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-[49px] z-30 -mx-6 flex flex-wrap items-center justify-between gap-3 border-b border-line-technical bg-bg/95 px-6 py-3 backdrop-blur-sm max-xl:top-[98px]">
        <div className="flex items-center gap-3">
          <Meta>
            {typeName} · {status === "final" ? "Abgeschlossen" : "Entwurf"}
          </Meta>
          <SaveIndicator state={save} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
            {preview ? "Vorschau ausblenden" : "Vorschau"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={save.kind === "saving" || save.kind === "conflict"}
            onClick={() => void persist(true)}
          >
            Version speichern
          </Button>
          <Link
            href={`/app/reports/${reportId}`}
            className="inline-flex h-8 items-center border-2 border-accent bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
          >
            Fertig
          </Link>
        </div>
      </div>

      {save.kind === "conflict" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-2 border-danger bg-danger/10 px-4 py-3 text-sm"
        >
          <span>
            Dieser Report wurde an anderer Stelle geändert (z. B. in einem zweiten Tab). Um nichts zu überschreiben, ist
            das Speichern pausiert.
          </span>
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
            Neu laden
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="border-l-2 border-accent bg-surface px-4 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      <div className={cn("grid gap-8", preview && "xl:grid-cols-2")}>
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="ed-meta" className="flex flex-col gap-4">
            <h2 id="ed-meta" className="sr-only">
              Titel und Einstellungen
            </h2>
            <input
              aria-label="Titel"
              value={draft.title}
              maxLength={200}
              aria-invalid={errors.title ? true : undefined}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full border-b-2 border-border-default bg-transparent pb-2 font-heading text-[28px] font-semibold focus-visible:border-accent focus-visible:outline-none"
            />
            {errors.title ? <p className="font-mono text-xs text-danger">{errors.title}</p> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-[13px] font-medium">
                Einstufung
                <select
                  value={draft.classification}
                  onChange={(e) => {
                    const classification = e.target.value as Classification;
                    update((d) => ({
                      ...d,
                      classification,
                      aiAllowed: classification === "internal_sensitive" ? false : d.aiAllowed,
                    }));
                  }}
                  className={cn(control, "h-10 font-normal")}
                >
                  {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-3 pt-7 text-sm">
                <input
                  type="checkbox"
                  checked={draft.aiAllowed}
                  disabled={draft.classification === "internal_sensitive"}
                  onChange={(e) => update({ aiAllowed: e.target.checked })}
                  className="mt-1 size-4 accent-[var(--accent)]"
                />
                <span>
                  KI-Verarbeitung erlauben
                  <span className="block text-xs text-text-secondary">
                    {draft.classification === "internal_sensitive"
                      ? "Für sensible Inhalte gesperrt."
                      : "Inhalte dürfen an den KI-Anbieter gehen."}
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section aria-labelledby="ed-fields" className="flex flex-col gap-4">
            <h2 id="ed-fields" className="text-lg font-semibold">
              Angaben
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {fieldSchema.map((field) => (
                <StructuredField
                  key={field.key}
                  field={field}
                  value={draft.structuredFields[field.key]}
                  error={errors[`structuredFields.${field.key}`]}
                  onChange={(value) => setField(field.key, value)}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="ed-content" className="flex flex-col gap-4">
            <h2 id="ed-content" className="text-lg font-semibold">
              Inhalt
            </h2>
            {draft.content.blocks.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Noch keine Blöcke. Füge Text, Code, Links oder Erkenntnisse hinzu.
              </p>
            ) : null}
            {draft.content.blocks.map((block, index) => (
              <BlockEditor
                key={block.id}
                block={block}
                index={index}
                count={draft.content.blocks.length}
                error={blockErrors[index]}
                onChange={(next) => setBlocks((blocks) => blocks.map((b) => (b.id === block.id ? next : b)))}
                onRemove={() => setBlocks((blocks) => blocks.filter((b) => b.id !== block.id))}
                onMove={(direction) =>
                  setBlocks((blocks) => {
                    const next = [...blocks];
                    const target = index + direction;
                    if (target < 0 || target >= next.length) return blocks;
                    [next[index], next[target]] = [next[target], next[index]];
                    return next;
                  })
                }
                onInsertAfter={(type) =>
                  setBlocks((blocks) => {
                    const next = [...blocks];
                    next.splice(index + 1, 0, createBlock(type));
                    return next;
                  })
                }
              />
            ))}
            <AddBlockMenu onAdd={(type) => setBlocks((blocks) => [...blocks, createBlock(type)])} />
          </section>
        </div>

        {preview ? (
          <aside
            aria-label="Live-Vorschau"
            className="min-w-0 border-2 border-border-default bg-surface p-6 xl:sticky xl:top-36 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto"
          >
            <Meta>Vorschau</Meta>
            <h1 className="mb-6 mt-2 text-3xl font-semibold">{draft.title}</h1>
            <DocumentView doc={draft.content} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text = {
    idle: "Alle Änderungen gespeichert",
    dirty: "Ungespeicherte Änderungen …",
    saving: "Speichert …",
    saved: state.kind === "saved" ? `Gespeichert ${timeFormat.format(state.at)}` : "",
    invalid: "Nicht gespeichert – bitte Eingaben prüfen",
    conflict: "Speichern pausiert (Konflikt)",
    error: "Speichern fehlgeschlagen – neuer Versuch läuft",
  }[state.kind];
  const tone =
    state.kind === "invalid" || state.kind === "conflict" || state.kind === "error"
      ? "text-danger"
      : "text-text-secondary";
  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-state={state.kind}
      className={cn("font-mono text-xs", tone)}
    >
      {text}
    </span>
  );
}

function StructuredField({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.key}`;
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || field.help ? `${id}-desc` : undefined,
  };
  const str = typeof value === "string" ? value : "";
  const wide = field.type === "textarea" || field.type === "tags";

  return (
    <div className={cn("flex flex-col gap-2", wide && "md:col-span-2")}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {field.label}
        {field.required ? (
          <span className="ml-1 text-accent" title="Pflichtfeld zum Abschließen">
            *
          </span>
        ) : null}
      </label>
      {field.type === "textarea" ? (
        <textarea
          {...common}
          value={str}
          rows={3}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
          className={cn(control, "py-2")}
        />
      ) : field.type === "select" ? (
        <select {...common} value={str} onChange={(e) => onChange(e.target.value)} className={cn(control, "h-10")}>
          <option value="">– bitte wählen –</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "tags" ? (
        <input
          {...common}
          defaultValue={Array.isArray(value) ? value.join(", ") : ""}
          placeholder="Kommagetrennt, z. B. Sentinel, KQL"
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          className={cn(control, "h-10")}
        />
      ) : (
        <input
          {...common}
          type={field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
          value={str}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
          className={cn(control, "h-10", (field.type === "url" || field.type === "date") && "font-mono")}
        />
      )}
      {error || field.help ? (
        <p id={`${id}-desc`} className={cn("text-xs", error ? "font-mono text-danger" : "text-text-secondary")}>
          {error ?? field.help}
        </p>
      ) : null}
    </div>
  );
}
