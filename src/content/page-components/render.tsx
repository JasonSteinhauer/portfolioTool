import type { ReactNode } from "react";
import type { PageComponent, PageConfig } from "./schema";

/**
 * Rendert Portfolio-Komponenten ausschließlich über React-Elemente (kein innerHTML).
 * Dieselben Komponenten nutzen Vorschau im Workspace und die freigegebene Ansicht.
 */

const INSIGHT_LABELS = {
  insight: "Erkenntnis",
  finding: "Befund",
  decision: "Entscheidung",
  warning: "Warnung",
} as const;

function Section({ heading, children, id }: { heading?: string; children: ReactNode; id: string }) {
  return (
    <section data-component-id={id} className="flex flex-col gap-6 border-t border-line-technical pt-10">
      {heading ? (
        <h2 className="flex items-center gap-3 text-2xl font-semibold">
          <span aria-hidden="true" className="block h-0.5 w-6 bg-accent" />
          {heading}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4 leading-relaxed text-text-secondary">
      {text
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}

/** Bild-URL je Kontext: Workspace-Vorschau (`/api/media/…`) oder freigegebene Ansicht (`/p/m/…`). */
export type MediaUrlBuilder = (mediaId: string) => string;
export const workspaceMediaUrl: MediaUrlBuilder = (id) => `/api/media/${id}`;
export const viewerMediaUrl: MediaUrlBuilder = (id) => `/p/m/${id}`;

export function PageComponentView({
  component,
  mediaUrl = workspaceMediaUrl,
}: {
  component: PageComponent;
  mediaUrl?: MediaUrlBuilder;
}) {
  switch (component.type) {
    case "hero":
      return (
        <header data-component-id={component.id} className="flex flex-col gap-5 pb-4">
          {component.eyebrow ? (
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-secondary">
              {component.eyebrow}
            </span>
          ) : null}
          <h1 className="max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl">{component.title}</h1>
          {component.summary ? <p className="max-w-2xl text-lg text-text-secondary">{component.summary}</p> : null}
          {component.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {component.tags.map((tag) => (
                <li
                  key={tag}
                  className="border border-border-default px-2 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-text-secondary"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </header>
      );
    case "projectOverview":
      return (
        <Section heading={component.heading} id={component.id}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]">
            {component.body ? <Paragraphs text={component.body} /> : <div />}
            {component.facts.length > 0 ? (
              <dl className="flex flex-col gap-4 border-l-2 border-accent pl-5">
                {component.facts.map((fact, i) => (
                  <div key={i}>
                    <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
                      {fact.label}
                    </dt>
                    <dd className="mt-1">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </Section>
      );
    case "resultHighlights":
      return (
        <Section heading={component.heading} id={component.id}>
          <ul className="grid gap-4 md:grid-cols-2">
            {component.items.map((item, i) => (
              <li key={i} className="border-2 border-border-default bg-surface p-6 shadow-card">
                <span className="font-mono text-xs text-accent-text">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-2 font-semibold">{item.title}</p>
                {item.text ? <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{item.text}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      );
    case "codeShowcase":
      return (
        <Section heading={component.heading} id={component.id}>
          <figure className="border-2 border-border-default bg-bg shadow-card">
            <figcaption className="flex justify-between border-b border-line-subtle px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
              <span>{component.filename ?? "Code"}</span>
              <span>{component.language}</span>
            </figcaption>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
              <code>{component.code}</code>
            </pre>
          </figure>
          {component.caption ? <p className="text-sm text-text-secondary">{component.caption}</p> : null}
        </Section>
      );
    case "gallery":
      if (component.items.length === 0) return null;
      return (
        <Section heading={component.heading} id={component.id}>
          <div className={component.items.length === 1 ? "flex flex-col gap-6" : "grid gap-6 md:grid-cols-2"}>
            {component.items.map((item, i) => (
              <figure key={`${item.mediaId}-${i}`} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- Dateien kommen aus eigener, geprüfter Route */}
                <img
                  src={mediaUrl(item.mediaId)}
                  alt={item.alt}
                  loading="lazy"
                  className="w-full border-2 border-border-default bg-bg"
                />
                {item.caption ? <figcaption className="text-sm text-text-secondary">{item.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
        </Section>
      );
    case "insights":
      return (
        <Section heading={component.heading} id={component.id}>
          <ul className="flex flex-col gap-4">
            {component.items.map((item, i) => (
              <li key={i} className="border-l-2 border-accent bg-surface px-6 py-5">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
                  {INSIGHT_LABELS[item.variant]}
                </span>
                <p className="mt-1 font-semibold">{item.title}</p>
                {item.text ? <p className="mt-2 whitespace-pre-line text-text-secondary">{item.text}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      );
  }
}

export function PageView({ config, mediaUrl }: { config: PageConfig; mediaUrl?: MediaUrlBuilder }) {
  return (
    <div className="flex flex-col gap-10">
      {config.components.map((component) => (
        <PageComponentView key={component.id} component={component} mediaUrl={mediaUrl} />
      ))}
    </div>
  );
}
