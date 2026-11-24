"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { requestRewriteAction } from "@/app/app/ai/actions";
import type { Block, ContentDocument } from "@/content/blocks/schema";
import type { FieldDefinition } from "@/modules/reports/report-types";
import type { Classification } from "@/modules/reports/service";
import { Button } from "@/ui/button";
import { Meta } from "@/ui/card";
import { cn } from "@/ui/cn";
import { ReportDocument } from "@/content/report-document";
import { AddBlockMenu, BlockEditor } from "./block-editor";

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
  | { kind: "error" };

/** Antwort von POST /api/reports/[id]/save (siehe route.ts). */
type SaveResponse =
  | { ok: true; revision: number; status: "draft" | "final"; savedAt: string; reopened: boolean }
  | { ok: false; reason: "conflict"; currentRevision: number }
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> }
  | { ok: false; reason: string };

/** Browser begrenzen keepalive-Anfragen auf 64 KB; größere Reports speichern normal. */
const KEEPALIVE_LIMIT_BYTES = 60_000;
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
  aiAvailable = false,
}: {
  reportId: string;
  typeName: string;
  fieldSchema: FieldDefinition[];
  initial: EditorInitial;
  /** KI ist auf dem Server eingerichtet. */
  aiAvailable?: boolean;
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
  const [aiPending, startAi] = useTransition();

  const router = useRouter();
  const revision = useRef(initial.revision);
  const latest = useRef(draft);
  const changeCounter = useRef(0);
  const savedCounter = useRef(0);
  const inFlight = useRef(false);
  const blocked = useRef(false);
  const lastFailed = useRef(false);

  useEffect(() => {
    latest.current = draft;
  }, [draft]);

  const update = useCallback((patch: Partial<Draft> | ((d: Draft) => Draft)) => {
    setDraft((current) => (typeof patch === "function" ? patch(current) : { ...current, ...patch }));
    changeCounter.current += 1;
    setSave((s) => (s.kind === "conflict" ? s : { kind: "dirty" }));
  }, []);

  const isDirty = () => changeCounter.current !== savedCounter.current;

  /**
   * Speichert den aktuellen Stand. Gespeichert wird beim Verlassen (Tab-Wechsel, Schließen,
   * Navigation), mit Strg+S, „Speichern“, „Version speichern“ und „Fertig“ – nicht bei jedem Tastendruck.
   * Liefert true, wenn danach nichts Ungespeichertes mehr vorliegt.
   */
  const persist = useCallback(
    async (options: { manual?: boolean; leaving?: boolean } = {}): Promise<boolean> => {
      if (blocked.current) return false;
      if (inFlight.current) return false;
      if (!options.manual && !isDirty()) return true;

      inFlight.current = true;
      const counterAtStart = changeCounter.current;
      const body = JSON.stringify({ ...latest.current, revision: revision.current, manual: Boolean(options.manual) });
      if (!options.leaving) setSave({ kind: "saving" });
      try {
        const response = await fetch(`/api/reports/${reportId}/save`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body,
          keepalive: Boolean(options.leaving) && body.length < KEEPALIVE_LIMIT_BYTES,
        });
        const result = (await response.json()) as SaveResponse;
        if (result.ok) {
          revision.current = result.revision;
          savedCounter.current = counterAtStart;
          lastFailed.current = false;
          setErrors({});
          setStatus(result.status);
          if (result.reopened) setNotice("Pflichtfelder fehlen – der Report ist wieder ein Entwurf.");
          const clean = changeCounter.current === counterAtStart;
          setSave(clean ? { kind: "saved", at: new Date(result.savedAt) } : { kind: "dirty" });
          return clean;
        }
        lastFailed.current = true;
        if (result.reason === "conflict") {
          blocked.current = true;
          setSave({ kind: "conflict" });
        } else if (result.reason === "invalid" && "fieldErrors" in result) {
          setErrors(result.fieldErrors);
          setSave({ kind: "invalid" });
        } else {
          setSave({ kind: "error" });
        }
        return false;
      } catch {
        lastFailed.current = true;
        setSave({ kind: "error" });
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [reportId],
  );

  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  // Speichern beim Verlassen: Tab-Wechsel/Minimieren, Schließen, Navigation innerhalb der App.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") void persistRef.current({ leaving: true });
    };
    const onPageHide = () => void persistRef.current({ leaving: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistRef.current();
      }
    };
    // Nur warnen, wenn sich nicht speichern lässt (Konflikt, Fehler, ungültige Eingaben).
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty() && (lastFailed.current || blocked.current)) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Komponente verschwindet (Navigation innerhalb der App) → letzten Stand mitnehmen.
      void persistRef.current({ leaving: true });
    };
  }, []);

  const finish = async () => {
    if (await persist()) router.push(`/app/reports/${reportId}`);
  };

  const setBlocks = (fn: (blocks: Block[]) => Block[]) =>
    update((d) => ({ ...d, content: { ...d.content, blocks: fn(d.content.blocks) } }));
  const setField = (key: string, value: unknown) =>
    update((d) => ({ ...d, structuredFields: { ...d.structuredFields, [key]: value } }));

  const blockErrors = Object.entries(errors).reduce<Record<number, string>>((acc, [key, message]) => {
    const match = /^content\.blocks\.(\d+)/.exec(key);
    if (match) acc[Number(match[1])] ??= message;
    return acc;
  }, {});

  /** KI-Fassung: erst speichern (die KI arbeitet mit dem gespeicherten Stand), dann Auftrag starten. */
  const requestRewrite = () => {
    if (!draft.aiAllowed || draft.classification === "internal_sensitive") {
      setNotice("Für die KI-Fassung zuerst „KI-Verarbeitung erlauben“ aktivieren (nicht bei „Intern / sensibel“).");
      return;
    }
    startAi(async () => {
      const saved = await persist();
      if (!saved) {
        setNotice("Bitte erst speichern – die KI-Fassung nutzt den gespeicherten Stand.");
        return;
      }
      const body = new FormData();
      body.set("reportId", reportId);
      const result = await requestRewriteAction({}, body);
      if (result?.error) setNotice(result.error);
    });
  };

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
          {aiAvailable ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={aiPending || save.kind === "saving" || save.kind === "conflict"}
              onClick={requestRewrite}
              title="Die KI formuliert deine Stichpunkte aus – du entscheidest, was übernommen wird."
            >
              {aiPending ? "KI arbeitet …" : "KI-Fassung"}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            title="Strg+S"
            disabled={save.kind === "saving" || save.kind === "conflict"}
            onClick={() => void persist()}
          >
            Speichern
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={save.kind === "saving" || save.kind === "conflict"}
            onClick={() => void persist({ manual: true })}
          >
            Version speichern
          </Button>
          <Button size="sm" disabled={save.kind === "saving" || save.kind === "conflict"} onClick={() => void finish()}>
            Fertig
          </Button>
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
                Noch keine Blöcke. Füge Text, Bilder, Code, Links oder Erkenntnisse hinzu.
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
                onInsertAfter={(inserted) =>
                  setBlocks((blocks) => {
                    const next = [...blocks];
                    next.splice(index + 1, 0, inserted);
                    return next;
                  })
                }
              />
            ))}
            <AddBlockMenu onAdd={(added) => setBlocks((blocks) => [...blocks, added])} />
          </section>
        </div>

        {preview ? (
          <aside
            aria-label="Live-Vorschau"
            // Scrollbarer Bereich muss per Tastatur erreichbar sein (WCAG 2.1.1).
            tabIndex={0}
            className="min-w-0 border-2 border-border-default bg-surface p-6 xl:sticky xl:top-36 xl:max-h-[calc(100dvh-10rem)] xl:overflow-y-auto"
          >
            <Meta>Vorschau</Meta>
            <div className="mt-4">
              <ReportDocument
                typeName={typeName}
                title={draft.title}
                fieldSchema={fieldSchema}
                structuredFields={draft.structuredFields}
                content={draft.content}
                status={status}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text = {
    idle: "Alle Änderungen gespeichert",
    dirty: "Ungespeichert – wird beim Verlassen gespeichert (Strg+S)",
    saving: "Speichert …",
    saved: state.kind === "saved" ? `Gespeichert ${timeFormat.format(state.at)}` : "",
    invalid: "Nicht gespeichert – bitte Eingaben prüfen",
    conflict: "Speichern pausiert (Konflikt)",
    error: "Speichern fehlgeschlagen – bitte erneut versuchen",
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
          <span className="ml-1 text-accent-text" title="Pflichtfeld zum Abschließen">
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
