import Link from "next/link";
import type { ReactNode } from "react";
import { DocumentView } from "@/content/blocks/render";
import type { MediaUrlBuilder } from "@/content/page-components/render";
import type { PageComponent, PageConfig } from "@/content/page-components/schema";
import { cn } from "@/ui/cn";

/**
 * Gestaltete Ansicht einer freigegebenen Seite (Fallstudie oder vollständiger Bericht), Stil „Terminal“:
 * großer Kopf, Eckdaten-Raster, nummerierte Abschnitte, mitlaufendes Inhaltsverzeichnis, verknüpfte Berichte.
 * Rendert ausschließlich über React-Elemente – nie HTML aus Eingaben.
 */

export type ViewerRelated = { title: string; relation: "buildsOn" | "leadsTo"; href: string | null };

const INSIGHT_LABELS = { insight: "Erkenntnis", finding: "Befund", decision: "Entscheidung", warning: "Warnung" };

type TocEntry = { id: string; label: string };

function toc(config: PageConfig): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const c of config.components) {
    switch (c.type) {
      case "hero":
        break;
      case "fullReport":
        c.sections.forEach((s, i) => entries.push({ id: `${c.id}-s${i}`, label: s.title }));
        if (c.blocks.length > 0) entries.push({ id: `${c.id}-details`, label: "Details" });
        break;
      case "gallery":
        if (c.items.length > 0) entries.push({ id: c.id, label: c.heading || "Bilder" });
        break;
      default:
        entries.push({ id: c.id, label: c.heading || "Abschnitt" });
    }
  }
  return entries;
}

function Numbered({ id, index, title, children }: { id: string; index: number; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="pv-rv scroll-mt-24">
      <h2 id={`${id}-h`} className="mb-5 text-[2rem] font-bold tracking-[-0.02em] text-[#e6e8eb]">
        <span className="mr-3 font-mono text-lg text-[#ff5cae]">{String(index).padStart(2, "0")}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Prose({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1 && lines.every((l) => l.length <= 240)) {
    return (
      <ul className="flex flex-col gap-2.5">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.75em] block size-1.5 shrink-0 rounded-full bg-[#ff4fa3]" />
            <span>{line.replace(/[,;]\s*$/, "")}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className="m-0 whitespace-pre-line">
            {p.trim()}
          </p>
        ))}
    </div>
  );
}

function Facts({ facts }: { facts: { label: string; value: string }[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border border-[#1c2128] bg-[#1c2128] [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
      {facts.map((f, i) => (
        <div key={i} className="bg-[#0e1217] px-6 py-5">
          <dt className="font-mono text-xs text-[#9aa3ad]">{f.label}</dt>
          <dd className="mt-2 text-lg font-semibold text-[#e6e8eb]">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Kopf der Seite (aus der Hero-Komponente). */
function Hero({
  hero,
  facts,
  tags,
}: {
  hero: Extract<PageComponent, { type: "hero" }> | undefined;
  facts: { label: string; value: string }[];
  tags: string[];
}) {
  return (
    <header className="mx-auto max-w-6xl px-6 pb-14 pt-20 sm:px-8 sm:pt-24">
      {hero?.eyebrow ? <p className="pv-in m-0 font-mono text-sm text-[#ff5cae]">{hero.eyebrow}</p> : null}
      <h1 className="pv-in pv-d1 mt-4 max-w-5xl text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.03] tracking-[-0.035em]">
        {hero?.title ?? "Ohne Titel"}
      </h1>
      {hero?.summary ? (
        <p className="pv-in pv-d2 mt-7 max-w-3xl text-xl leading-relaxed text-[#9aa3ad]">{hero.summary}</p>
      ) : null}
      {tags.length > 0 ? (
        <p className="pv-in pv-d2 mt-6 font-mono text-[13px] text-[#7ee0b5]">{tags.join(" · ")}</p>
      ) : null}
      {facts.length > 0 ? (
        <div className="pv-in pv-d3 mt-12">
          <Facts facts={facts} />
        </div>
      ) : null}
    </header>
  );
}

function Body({
  component,
  index,
  mediaUrl,
}: {
  component: PageComponent;
  index: () => number;
  mediaUrl: MediaUrlBuilder;
}) {
  switch (component.type) {
    case "hero":
      return null;
    case "projectOverview":
      return (
        <Numbered id={component.id} index={index()} title={component.heading || "Überblick"}>
          {component.body ? <Prose text={component.body} /> : null}
          {component.facts.length > 0 ? (
            <div className="mt-6">
              <Facts facts={component.facts} />
            </div>
          ) : null}
        </Numbered>
      );
    case "resultHighlights":
      return (
        <Numbered id={component.id} index={index()} title={component.heading || "Ergebnisse"}>
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
            {component.items.map((item, i) => (
              <li key={i} className="rounded-xl border border-[#1c2128] bg-[#0e1217] p-6">
                <span className="font-mono text-xs text-[#ff5cae]">{String(i + 1).padStart(2, "0")}</span>
                <p className="mt-2 font-semibold text-[#e6e8eb]">{item.title}</p>
                {item.text ? <p className="mt-2 whitespace-pre-line text-base text-[#9aa3ad]">{item.text}</p> : null}
              </li>
            ))}
          </ul>
        </Numbered>
      );
    case "codeShowcase":
      return (
        <Numbered id={component.id} index={index()} title={component.heading || "Code"}>
          <figure className="m-0 overflow-hidden rounded-xl border border-[#1c2128] bg-[#0e1217]">
            <figcaption className="flex justify-between border-b border-[#1c2128] px-5 py-2.5 font-mono text-xs text-[#9aa3ad]">
              <span>{component.filename ?? "code"}</span>
              <span>{component.language}</span>
            </figcaption>
            <pre className="m-0 overflow-x-auto p-5 font-mono text-[13.5px] leading-relaxed text-[#c9ced4]">
              <code>{component.code}</code>
            </pre>
          </figure>
          {component.caption ? <p className="mt-3 text-sm text-[#9aa3ad]">{component.caption}</p> : null}
        </Numbered>
      );
    case "gallery":
      if (component.items.length === 0) return null;
      return (
        <Numbered id={component.id} index={index()} title={component.heading || "Bilder"}>
          <div className={cn("grid gap-6", component.items.length > 1 && "md:grid-cols-2")}>
            {component.items.map((item, i) => (
              <figure key={`${item.mediaId}-${i}`} className="m-0 flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- Dateien kommen aus eigener, geprüfter Route */}
                <img
                  src={mediaUrl(item.mediaId)}
                  alt={item.alt}
                  loading="lazy"
                  className="w-full rounded-xl border border-[#1c2128] bg-[#0e1217]"
                />
                {item.caption ? <figcaption className="text-sm text-[#9aa3ad]">{item.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
        </Numbered>
      );
    case "insights":
      return (
        <Numbered id={component.id} index={index()} title={component.heading || "Erkenntnisse"}>
          <ul className="flex flex-col gap-5">
            {component.items.map((item, i) => (
              <li key={i} className="border-l-[3px] border-[#ff4fa3] py-1 pl-6">
                <span className="font-mono text-xs text-[#9aa3ad]">{INSIGHT_LABELS[item.variant]}</span>
                <p className="mt-1 text-xl font-semibold leading-snug text-[#e6e8eb]">{item.title}</p>
                {item.text ? <p className="mt-2 whitespace-pre-line text-[#9aa3ad]">{item.text}</p> : null}
              </li>
            ))}
          </ul>
        </Numbered>
      );
    case "fullReport":
      return (
        <>
          {component.sections.map((section, i) => (
            <Numbered key={i} id={`${component.id}-s${i}`} index={index()} title={section.title}>
              <Prose text={section.text} />
            </Numbered>
          ))}
          {component.blocks.length > 0 ? (
            <Numbered id={`${component.id}-details`} index={index()} title="Details">
              <div className="pv-doc">
                <DocumentView doc={{ schemaVersion: 1, blocks: component.blocks }} mediaUrl={mediaUrl} />
              </div>
            </Numbered>
          ) : null}
        </>
      );
  }
}

export function ViewerDocument({
  config,
  mediaUrl,
  related,
  homeHref,
  homeLabel,
}: {
  config: PageConfig;
  mediaUrl: MediaUrlBuilder;
  related: ViewerRelated[];
  homeHref?: string;
  homeLabel?: string;
}) {
  const hero = config.components.find((c): c is Extract<PageComponent, { type: "hero" }> => c.type === "hero");
  const full = config.components.find(
    (c): c is Extract<PageComponent, { type: "fullReport" }> => c.type === "fullReport",
  );
  const entries = toc(config);
  let n = 0;
  const next = () => ++n;
  const buildsOn = related.filter((r) => r.relation === "buildsOn");
  const leadsTo = related.filter((r) => r.relation === "leadsTo");
  const relatedTitle = "Verknüpfte Berichte";

  return (
    <article>
      <Hero
        // Steht die Zusammenfassung schon als Abschnitt im Bericht, nicht doppelt zeigen.
        hero={
          hero && full?.sections.some((s) => s.text.trim() === hero.summary.trim()) ? { ...hero, summary: "" } : hero
        }
        facts={full?.facts ?? []}
        tags={[...new Set([...(hero?.tags ?? []), ...(full?.tags ?? [])])].slice(0, 12)}
      />
      <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-14 px-6 pb-20 sm:px-8">
        {entries.length > 1 || related.length > 0 ? (
          <nav aria-label="Inhalt" className="flex-[1_1_220px] font-mono text-sm lg:sticky lg:top-24">
            <p className="mb-4 mt-0 text-[#9aa3ad]">{"// inhalt"}</p>
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {entries.map((e, i) => (
                <li key={e.id}>
                  <a
                    href={`#${e.id}`}
                    className="text-[#9aa3ad] transition-[color,padding] hover:pl-1.5 hover:text-[#ff5cae]"
                  >
                    {String(i + 1).padStart(2, "0")} {e.label}
                  </a>
                </li>
              ))}
              {related.length > 0 ? (
                <li>
                  <a
                    href="#verknuepft"
                    className="text-[#9aa3ad] transition-[color,padding] hover:pl-1.5 hover:text-[#ff5cae]"
                  >
                    ↳ {relatedTitle}
                  </a>
                </li>
              ) : null}
            </ol>
          </nav>
        ) : null}
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-16 text-lg leading-[1.75] text-[#c9ced4]">
          {config.components.map((c) => (
            <Body key={c.id} component={c} index={next} mediaUrl={mediaUrl} />
          ))}
          {related.length > 0 ? (
            <section
              id="verknuepft"
              aria-labelledby="verknuepft-h"
              className="pv-rv scroll-mt-24 border-t border-[#1c2128] pt-10"
            >
              <h2 id="verknuepft-h" className="mb-5 font-mono text-sm font-medium text-[#9aa3ad]">
                {"// "}
                {relatedTitle.toLowerCase()}
              </h2>
              <RelatedList title="Baut auf" items={buildsOn} />
              <RelatedList title="Führt weiter zu" items={leadsTo} />
            </section>
          ) : null}
          {homeHref ? (
            <Link href={homeHref} className="font-mono text-sm text-[#ff5cae] hover:text-[#ff8cc6]">
              ← {homeLabel ?? "Zur Übersicht"}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function RelatedList({ title, items }: { title: string; items: ViewerRelated[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="mb-3 mt-0 text-sm text-[#9aa3ad]">{title}</p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" data-testid="viewer-related">
        {items.map((r, i) =>
          r.href ? (
            <li key={i}>
              <Link
                href={r.href}
                className="pv-card flex justify-between gap-4 rounded-xl border border-[#1c2128] bg-[#0e1217] px-6 py-4 text-base text-[#e6e8eb]"
              >
                <span>{r.title}</span>
                <span aria-hidden="true" className="font-mono text-sm text-[#ff5cae]">
                  lesen →
                </span>
              </Link>
            </li>
          ) : (
            <li
              key={i}
              className="flex justify-between gap-4 rounded-xl border border-dashed border-[#1c2128] px-6 py-4 text-base text-[#9aa3ad]"
            >
              <span>{r.title}</span>
              <span className="font-mono text-xs">nicht freigegeben</span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
