import type { ContentDocument } from "@/content/blocks/schema";
import { DocumentView, isRenderable } from "@/content/blocks/render";
import type { FieldDefinition } from "@/modules/reports/report-types";

/**
 * Gestaltete Darstellung eines kompletten Reports: Kopf, Eckdaten, ausformulierte Abschnitte
 * (Textfelder) und Inhaltsblöcke. Rein darstellend – genutzt für Live-Vorschau, Report-Ansicht
 * und die Vorschau der KI-Fassung. Rendert nie HTML aus Eingaben.
 */
export type ReportDocumentProps = {
  typeName: string;
  title: string;
  fieldSchema: FieldDefinition[];
  structuredFields: Record<string, unknown>;
  content: ContentDocument;
  status?: "draft" | "final" | "archived";
  /** Hervorgehobene Felder (z. B. von der KI geänderte) – Schlüssel wie `field:task` oder `title`. */
  highlight?: ReadonlySet<string>;
  /** Titel weglassen, wenn die Seite ihn bereits als Hauptüberschrift zeigt (nur eine h1 pro Seite). */
  hideTitle?: boolean;
};

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" });

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function formatShort(field: FieldDefinition, value: unknown): string {
  if (field.type === "date" && typeof value === "string") return dateFormat.format(new Date(`${value}T12:00:00Z`));
  if (field.type === "select") return field.options?.find((o) => o.value === value)?.label ?? String(value);
  return String(value);
}

/** Mehrzeilige Stichpunkte werden zur Liste; ein einzelner Absatz bleibt Fließtext. */
export function LongText({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
  const isList = lines.length > 1 && lines.every((l) => l.length <= 240);
  if (!isList) {
    return <p className="whitespace-pre-line leading-relaxed text-text-primary">{text.trim()}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-3 leading-relaxed">
          <span aria-hidden="true" className="mt-[0.6em] block size-1.5 shrink-0 bg-accent" />
          <span>{line.replace(/[,;]\s*$/, "")}</span>
        </li>
      ))}
    </ul>
  );
}

const marked = "rounded-none bg-accent/10 outline outline-1 outline-offset-4 outline-accent/40";

export function ReportDocument({
  typeName,
  title,
  fieldSchema,
  structuredFields,
  content,
  status,
  highlight,
  hideTitle = false,
}: ReportDocumentProps) {
  const filled = fieldSchema.filter((f) => !isEmpty(structuredFields[f.key]));
  const dateField = filled.find((f) => f.type === "date");
  const facts = filled.filter(
    (f) => f !== dateField && (f.type === "text" || f.type === "select" || f.type === "date" || f.type === "url"),
  );
  const tags = filled.filter((f) => f.type === "tags");
  const sections = filled.filter((f) => f.type === "textarea");
  const blocks = content.blocks.filter(isRenderable);
  const hl = (key: string) => (highlight?.has(key) ? marked : "");

  return (
    <article className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-secondary">
          {typeName}
          {dateField ? ` · ${formatShort(dateField, structuredFields[dateField.key])}` : ""}
          {status === "draft" ? " · Entwurf" : ""}
        </p>
        {hideTitle ? null : (
          <h1 className={`text-3xl font-semibold leading-tight sm:text-4xl ${hl("title")}`}>{title || "Ohne Titel"}</h1>
        )}
        <span aria-hidden="true" className="block h-0.5 w-12 bg-accent" />
      </header>

      {facts.length > 0 || tags.length > 0 ? (
        <section aria-label="Eckdaten" className="flex flex-col gap-5 border-y-2 border-border-default py-5">
          {facts.length > 0 ? (
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {facts.map((f) => {
                const value = structuredFields[f.key];
                return (
                  <div key={f.key} className={hl(`field:${f.key}`)}>
                    <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">{f.label}</dt>
                    <dd className="mt-1 font-medium">
                      {f.type === "url" && typeof value === "string" && /^https?:\/\//i.test(value) ? (
                        <a
                          href={value}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="break-all underline decoration-accent underline-offset-4"
                        >
                          {value}
                        </a>
                      ) : (
                        formatShort(f, value)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : null}
          {tags.map((f) => (
            <div key={f.key}>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">{f.label}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {(structuredFields[f.key] as string[]).map((tag) => (
                  <li key={tag} className="border border-border-strong px-2 py-0.5 font-mono text-xs">
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {sections.map((f) => (
        <section key={f.key} aria-labelledby={`sec-${f.key}`} className={`flex flex-col gap-3 ${hl(`field:${f.key}`)}`}>
          <h2 id={`sec-${f.key}`} className="flex items-center gap-3 text-lg font-semibold">
            <span aria-hidden="true" className="block h-0.5 w-4 bg-accent" />
            {f.label}
          </h2>
          <LongText text={String(structuredFields[f.key])} />
        </section>
      ))}

      {blocks.length > 0 ? (
        <section aria-label="Inhalt" className="flex flex-col gap-3">
          {sections.length > 0 ? (
            <h2 className="flex items-center gap-3 text-lg font-semibold">
              <span aria-hidden="true" className="block h-0.5 w-4 bg-accent" />
              Details
            </h2>
          ) : null}
          <DocumentView doc={content} />
        </section>
      ) : filled.length === 0 ? (
        <p className="text-text-secondary">Noch keine Angaben und kein Inhalt.</p>
      ) : null}
    </article>
  );
}
