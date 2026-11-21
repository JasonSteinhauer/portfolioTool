"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { CODE_LANGUAGES, INSIGHT_VARIANTS } from "@/content/blocks/schema";
import { PageView } from "@/content/page-components/render";
import {
  emptyComponent,
  PAGE_COMPONENT_TYPES,
  type PageComponent,
  type PageComponentType,
  type PageConfig,
} from "@/content/page-components/schema";
import { Button } from "@/ui/button";
import { Meta } from "@/ui/card";
import { cn } from "@/ui/cn";
import { MediaPickerDialog } from "@/ui/media/media-picker";
import { mediaUrl } from "@/ui/media/upload";
import { publishPageAction, savePageAction, type PublishState } from "../actions";

const control =
  "w-full border-2 border-border-default bg-bg px-3 text-sm text-text-primary placeholder:text-text-secondary/70 hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

const TYPE_LABELS: Record<PageComponentType, string> = {
  hero: "Hero",
  projectOverview: "Überblick",
  resultHighlights: "Ergebnisse",
  codeShowcase: "Code",
  gallery: "Bilder",
  insights: "Erkenntnisse",
};

const INSIGHT_LABELS = {
  insight: "Erkenntnis",
  finding: "Befund",
  decision: "Entscheidung",
  warning: "Warnung",
} as const;

type PageMeta = { title: string; slug: string; locale: "de" | "en" };

export function PageEditor({
  pageId,
  initialMeta,
  initialConfig,
  publishedVersion,
}: {
  pageId: string;
  initialMeta: PageMeta;
  initialConfig: PageConfig;
  publishedVersion: number | null;
}) {
  const [meta, setMeta] = useState(initialMeta);
  const [config, setConfig] = useState(initialConfig);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [publish, publishAction, publishing] = useActionState<PublishState, FormData>(publishPageAction, {});
  const latest = useRef({ meta, config });

  useEffect(() => {
    latest.current = { meta, config };
  }, [meta, config]);

  const change =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };
  const setComponents = (fn: (c: PageComponent[]) => PageComponent[]) =>
    change(setConfig)({ ...config, components: fn(config.components) });

  const save = async (): Promise<boolean> => {
    setSaving(true);
    const result = await savePageAction(pageId, { ...latest.current.meta, config: latest.current.config });
    setSaving(false);
    if (result.ok) {
      setDirty(false);
      setErrors({});
      return true;
    }
    setErrors(result.fieldErrors);
    return false;
  };

  // Strg+S speichert; Warnung beim Verlassen nur mit ungespeicherten Änderungen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  });

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="sticky top-[49px] z-30 -mx-6 flex flex-wrap items-center justify-between gap-3 border-b border-line-technical bg-bg/95 px-6 py-3 backdrop-blur-sm max-xl:top-[98px]">
          <span
            role="status"
            data-testid="page-save-status"
            className={cn("font-mono text-xs", dirty ? "text-text-primary" : "text-text-secondary")}
          >
            {saving ? "Speichert …" : dirty ? "Ungespeicherte Änderungen (Strg+S)" : "Gespeichert"}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={saving || !dirty} onClick={() => void save()}>
              Speichern
            </Button>
            <form
              action={async (formData) => {
                if (dirty && !(await save())) return;
                publishAction(formData);
              }}
            >
              <input type="hidden" name="pageId" value={pageId} />
              <Button type="submit" size="sm" disabled={publishing || saving}>
                {publishing ? "Wird freigegeben …" : "Freigeben"}
              </Button>
            </form>
          </div>
        </div>

        {publish.error ? (
          <p role="alert" className="border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm">
            {publish.error}
          </p>
        ) : null}
        {publish.published ? (
          <p role="status" className="border-l-2 border-accent bg-surface px-3 py-2 text-sm">
            Freigegeben als Version {publish.published}. Spätere Änderungen werden erst mit der nächsten Freigabe
            sichtbar.
          </p>
        ) : publishedVersion ? (
          <p className="text-sm text-text-secondary">Aktuell freigegeben: Version {publishedVersion}.</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px_100px]">
          <label className="flex flex-col gap-2 text-[13px] font-medium">
            Seitentitel
            <input
              value={meta.title}
              onChange={(e) => change(setMeta)({ ...meta, title: e.target.value })}
              className={cn(control, "h-10 font-normal")}
            />
          </label>
          <label className="flex flex-col gap-2 text-[13px] font-medium">
            Adresse (/p/…)
            <input
              value={meta.slug}
              onChange={(e) => change(setMeta)({ ...meta, slug: e.target.value })}
              aria-invalid={errors.slug ? true : undefined}
              className={cn(control, "h-10 font-mono font-normal")}
            />
          </label>
          <label className="flex flex-col gap-2 text-[13px] font-medium">
            Sprache
            <select
              value={meta.locale}
              onChange={(e) => change(setMeta)({ ...meta, locale: e.target.value === "en" ? "en" : "de" })}
              className={cn(control, "h-10 font-normal")}
            >
              <option value="de">DE</option>
              <option value="en">EN</option>
            </select>
          </label>
        </div>
        {Object.entries(errors).length > 0 ? (
          <ul role="alert" className="font-mono text-xs text-danger">
            {Object.entries(errors).map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        ) : null}

        {config.components.map((component, index) => (
          <ComponentEditor
            key={component.id}
            component={component}
            index={index}
            count={config.components.length}
            onChange={(next) => setComponents((list) => list.map((c) => (c.id === component.id ? next : c)))}
            onRemove={() => setComponents((list) => list.filter((c) => c.id !== component.id))}
            onMove={(dir) =>
              setComponents((list) => {
                const next = [...list];
                const target = index + dir;
                if (target < 0 || target >= next.length) return list;
                [next[index], next[target]] = [next[target], next[index]];
                return next;
              })
            }
          />
        ))}

        <div role="group" aria-label="Abschnitt hinzufügen" className="flex flex-wrap items-center gap-2">
          <Meta>+ Abschnitt</Meta>
          {PAGE_COMPONENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setComponents((list) => [...list, emptyComponent(type)])}
              className="h-8 border-2 border-border-default px-3 text-[13px] hover:border-border-strong hover:bg-hover-surface"
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      <aside
        aria-label="Vorschau der Seite"
        // Scrollbarer Bereich muss per Tastatur erreichbar sein (WCAG 2.1.1).
        tabIndex={0}
        className="min-w-0 border-2 border-border-default bg-bg p-8 xl:sticky xl:top-28 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto"
      >
        <Meta>Vorschau · so sehen es Personen mit Freigabelink</Meta>
        <div className="mt-6">
          <PageView config={config} />
        </div>
      </aside>
    </div>
  );
}

function ComponentEditor({
  component,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  component: PageComponent;
  index: number;
  count: number;
  onChange: (c: PageComponent) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const label = `Abschnitt ${index + 1}: ${TYPE_LABELS[component.type]}`;
  const input = (
    name: string,
    value: string,
    set: (v: string) => void,
    opts: { area?: boolean; mono?: boolean; placeholder?: string } = {},
  ) =>
    opts.area ? (
      <textarea
        aria-label={`${label} – ${name}`}
        value={value}
        placeholder={opts.placeholder ?? name}
        rows={4}
        onChange={(e) => set(e.target.value)}
        className={cn(control, "py-2", opts.mono && "font-mono text-[13px]")}
      />
    ) : (
      <input
        aria-label={`${label} – ${name}`}
        value={value}
        placeholder={opts.placeholder ?? name}
        onChange={(e) => set(e.target.value)}
        className={cn(control, "h-10", opts.mono && "font-mono")}
      />
    );

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="page-component"
      className="border-2 border-border-default bg-surface"
    >
      <div className="flex items-center justify-between border-b border-line-subtle px-3 py-1">
        <Meta>
          {String(index + 1).padStart(2, "0")} · {TYPE_LABELS[component.type]}
        </Meta>
        <div className="flex">
          {[
            { text: "↑", aria: `${label} nach oben`, run: () => onMove(-1), disabled: index === 0 },
            { text: "↓", aria: `${label} nach unten`, run: () => onMove(1), disabled: index === count - 1 },
            { text: "×", aria: `${label} entfernen`, run: onRemove, disabled: false },
          ].map((b) => (
            <button
              key={b.aria}
              type="button"
              aria-label={b.aria}
              title={b.aria}
              disabled={b.disabled}
              onClick={b.run}
              className="flex size-7 items-center justify-center text-sm text-text-secondary hover:bg-hover-surface hover:text-text-primary disabled:opacity-30"
            >
              {b.text}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 p-3">
        {component.type === "hero" ? (
          <>
            {input("Überzeile", component.eyebrow, (v) => onChange({ ...component, eyebrow: v }))}
            {input("Titel", component.title, (v) => onChange({ ...component, title: v }))}
            {input("Zusammenfassung", component.summary, (v) => onChange({ ...component, summary: v }), { area: true })}
            {input("Schlagworte (kommagetrennt)", component.tags.join(", "), (v) =>
              onChange({
                ...component,
                tags: v
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 10),
              }),
            )}
          </>
        ) : null}
        {component.type === "projectOverview" ? (
          <>
            {input("Überschrift", component.heading, (v) => onChange({ ...component, heading: v }))}
            {input("Text", component.body, (v) => onChange({ ...component, body: v }), { area: true })}
            <PairList
              label={label}
              items={component.facts.map((f) => [f.label, f.value])}
              names={["Bezeichnung", "Wert"]}
              onChange={(pairs) => onChange({ ...component, facts: pairs.map(([l, v]) => ({ label: l, value: v })) })}
            />
          </>
        ) : null}
        {component.type === "resultHighlights" ? (
          <>
            {input("Überschrift", component.heading, (v) => onChange({ ...component, heading: v }))}
            <PairList
              label={label}
              items={component.items.map((i) => [i.title, i.text])}
              names={["Ergebnis", "Beschreibung"]}
              onChange={(pairs) => onChange({ ...component, items: pairs.map(([t, x]) => ({ title: t, text: x })) })}
            />
          </>
        ) : null}
        {component.type === "codeShowcase" ? (
          <>
            {input("Überschrift", component.heading, (v) => onChange({ ...component, heading: v }))}
            <div className="flex gap-2">
              <select
                aria-label={`${label} – Sprache`}
                value={component.language}
                onChange={(e) =>
                  onChange({ ...component, language: e.target.value as (typeof CODE_LANGUAGES)[number] })
                }
                className={cn(control, "h-10 w-40 font-mono")}
              >
                {CODE_LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              {input(
                "Dateiname",
                component.filename ?? "",
                (v) => onChange({ ...component, filename: v || undefined }),
                { mono: true },
              )}
            </div>
            {input("Code", component.code, (v) => onChange({ ...component, code: v }), { area: true, mono: true })}
            {input("Bildunterschrift", component.caption, (v) => onChange({ ...component, caption: v }))}
          </>
        ) : null}
        {component.type === "gallery" ? (
          <GalleryEditor component={component} label={label} input={input} onChange={onChange} />
        ) : null}
        {component.type === "insights" ? (
          <>
            {input("Überschrift", component.heading, (v) => onChange({ ...component, heading: v }))}
            {component.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-2 border-l-2 border-accent pl-3">
                <div className="flex gap-2">
                  <select
                    aria-label={`${label} – Eintrag ${i + 1} Art`}
                    value={item.variant}
                    onChange={(e) =>
                      onChange({
                        ...component,
                        items: component.items.map((x, j) =>
                          j === i ? { ...x, variant: e.target.value as (typeof INSIGHT_VARIANTS)[number] } : x,
                        ),
                      })
                    }
                    className={cn(control, "h-10 w-40")}
                  >
                    {INSIGHT_VARIANTS.map((v) => (
                      <option key={v} value={v}>
                        {INSIGHT_LABELS[v]}
                      </option>
                    ))}
                  </select>
                  {input(`Eintrag ${i + 1} Titel`, item.title, (v) =>
                    onChange({
                      ...component,
                      items: component.items.map((x, j) => (j === i ? { ...x, title: v } : x)),
                    }),
                  )}
                  <button
                    type="button"
                    aria-label={`${label} – Eintrag ${i + 1} entfernen`}
                    onClick={() => onChange({ ...component, items: component.items.filter((_, j) => j !== i) })}
                    className="px-2 text-text-secondary hover:text-text-primary"
                  >
                    ×
                  </button>
                </div>
                {input(
                  `Eintrag ${i + 1} Text`,
                  item.text,
                  (v) =>
                    onChange({ ...component, items: component.items.map((x, j) => (j === i ? { ...x, text: v } : x)) }),
                  { area: true },
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...component,
                  items: [...component.items, { variant: "insight", title: "Neue Erkenntnis", text: "" }],
                })
              }
              className="self-start text-sm text-text-secondary underline decoration-accent underline-offset-4 hover:text-text-primary"
            >
              + Eintrag
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function GalleryEditor({
  component,
  label,
  input,
  onChange,
}: {
  component: Extract<PageComponent, { type: "gallery" }>;
  label: string;
  input: (name: string, value: string, set: (v: string) => void, opts?: { area?: boolean }) => ReactNode;
  onChange: (c: PageComponent) => void;
}) {
  const [picking, setPicking] = useState(false);
  const setItem = (i: number, patch: Partial<(typeof component.items)[number]>) =>
    onChange({ ...component, items: component.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <>
      {input("Überschrift", component.heading, (v) => onChange({ ...component, heading: v }))}
      {component.items.map((item, i) => (
        <div key={`${item.mediaId}-${i}`} className="flex gap-3 border-l-2 border-accent pl-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- private Datei */}
          <img
            src={mediaUrl(item.mediaId)}
            alt=""
            className="h-20 w-28 shrink-0 border border-border-default object-contain"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {input(`Bild ${i + 1} Beschreibung`, item.alt, (v) => setItem(i, { alt: v }))}
            {input(`Bild ${i + 1} Bildunterschrift`, item.caption, (v) => setItem(i, { caption: v }))}
            {item.alt.trim() === "" ? (
              <p className="text-xs text-danger">Bildbeschreibung fehlt – nötig für die Freigabe.</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={`${label} – Bild ${i + 1} entfernen`}
            onClick={() => onChange({ ...component, items: component.items.filter((_, j) => j !== i) })}
            className="self-start px-2 text-text-secondary hover:text-text-primary"
          >
            ×
          </button>
        </div>
      ))}
      {component.items.length < 12 ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="self-start text-sm text-text-secondary underline decoration-accent underline-offset-4 hover:text-text-primary"
        >
          + Bild
        </button>
      ) : null}
      <MediaPickerDialog
        open={picking}
        kind="image"
        title="Bild hinzufügen"
        onClose={() => setPicking(false)}
        onPick={(asset) => {
          onChange({
            ...component,
            items: [...component.items, { mediaId: asset.id, alt: asset.altText ?? "", caption: "" }],
          });
          setPicking(false);
        }}
      />
    </>
  );
}

function PairList({
  label,
  items,
  names,
  onChange,
}: {
  label: string;
  items: [string, string][];
  names: [string, string];
  onChange: (items: [string, string][]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map(([a, b], i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2">
          <input
            aria-label={`${label} – ${names[0]} ${i + 1}`}
            value={a}
            placeholder={names[0]}
            onChange={(e) => onChange(items.map((p, j) => (j === i ? [e.target.value, p[1]] : p)))}
            className={cn(control, "h-10")}
          />
          <input
            aria-label={`${label} – ${names[1]} ${i + 1}`}
            value={b}
            placeholder={names[1]}
            onChange={(e) => onChange(items.map((p, j) => (j === i ? [p[0], e.target.value] : p)))}
            className={cn(control, "h-10")}
          />
          <button
            type="button"
            aria-label={`${label} – ${names[0]} ${i + 1} entfernen`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="px-2 text-text-secondary hover:text-text-primary"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, [names[0], ""]])}
        className="self-start text-sm text-text-secondary underline decoration-accent underline-offset-4 hover:text-text-primary"
      >
        + {names[0]}
      </button>
    </div>
  );
}
