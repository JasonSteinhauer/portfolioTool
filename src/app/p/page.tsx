import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getViewerHome } from "@/modules/sharing/service";
import { getViewerLink } from "@/modules/sharing/viewer";

export const metadata: Metadata = { title: "Portfolio" };

const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric", timeZone: "Europe/Berlin" });

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-8 flex items-center gap-3 text-2xl font-semibold">
      <span aria-hidden="true" className="block h-0.5 w-6 bg-accent" />
      {children}
    </h2>
  );
}

/** One-Pager: Über mich, ausgewählte Arbeiten, Expertise, Entwicklung, Kontakt. */
export default async function ViewerHome() {
  const link = await getViewerLink();
  if (!link) notFound();
  const { profile, pages } = await getViewerHome(getDb(), link);

  // Ein Seiten-Link führt direkt zur Seite.
  if (link.scopeType === "page" && pages.length === 1) {
    const only = pages[0];
    return (
      <div className="flex flex-col gap-6">
        <p className="text-text-secondary">Dir wurde eine Arbeit freigegeben:</p>
        <Link
          href={`/p/${only.slug}`}
          className="block border-2 border-border-default bg-surface p-8 shadow-card hover:border-accent"
        >
          <span className="text-2xl font-semibold">{only.snapshot.title}</span>
        </Link>
      </div>
    );
  }

  const timeline = [...pages].sort((a, b) => b.approvedAt.getTime() - a.approvedAt.getTime());

  return (
    <div className="flex flex-col gap-24">
      {profile ? (
        <section aria-labelledby="about" className="flex flex-col gap-6">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-text-secondary">
            {profile.role || "Portfolio"}
          </span>
          <h1 id="about" className="max-w-4xl text-5xl font-semibold leading-tight sm:text-6xl">
            {profile.name}
          </h1>
          {profile.about ? (
            <p className="max-w-2xl whitespace-pre-line text-lg leading-relaxed text-text-secondary">{profile.about}</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="work">
        <SectionTitle id="work">Ausgewählte Arbeiten</SectionTitle>
        {pages.length === 0 ? (
          <p className="text-text-secondary">Noch keine Arbeiten freigegeben.</p>
        ) : (
          <ul className="grid gap-6 md:grid-cols-2" data-testid="viewer-work">
            {pages.map((page, i) => {
              const hero = page.snapshot.page.components.find((c) => c.type === "hero");
              return (
                <li key={page.pageId}>
                  <Link
                    href={`/p/${page.slug}`}
                    className="group flex h-full flex-col gap-3 border-2 border-border-default bg-surface p-7 shadow-card transition-[border-color,box-shadow,transform] duration-[var(--motion-normal)] ease-technical hover:-translate-y-1 hover:border-accent hover:shadow-hover"
                  >
                    <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
                    {hero && hero.type === "hero" && hero.eyebrow ? (
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
                        {hero.eyebrow}
                      </span>
                    ) : null}
                    <span className="text-xl font-semibold">{page.snapshot.title}</span>
                    {hero && hero.type === "hero" && hero.summary ? (
                      <span className="text-sm text-text-secondary">{hero.summary}</span>
                    ) : null}
                    <span
                      aria-hidden="true"
                      className="mt-auto pt-4 font-mono text-xs text-text-secondary group-hover:text-text-primary"
                    >
                      Fallstudie ansehen →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {profile && profile.expertise.length > 0 ? (
        <section aria-labelledby="expertise">
          <SectionTitle id="expertise">Expertise</SectionTitle>
          <dl className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            {profile.expertise.map((item) => (
              <div key={item.area} className="border-l-2 border-line-technical pl-5">
                <dt className="font-semibold">{item.area}</dt>
                {item.detail ? <dd className="mt-1 text-sm text-text-secondary">{item.detail}</dd> : null}
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {timeline.length > 0 ? (
        <section aria-labelledby="timeline">
          <SectionTitle id="timeline">Entwicklung</SectionTitle>
          <ol className="relative flex flex-col gap-8 border-l-2 border-line-technical pl-8">
            {timeline.map((page) => (
              <li key={page.pageId} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[39px] top-1.5 block size-3 border-2 border-accent bg-bg"
                />
                <span className="font-mono text-xs uppercase tracking-[0.08em] text-text-secondary">
                  {monthFormat.format(page.approvedAt)}
                </span>
                <Link
                  href={`/p/${page.slug}`}
                  className="mt-1 block font-medium hover:underline hover:decoration-accent hover:underline-offset-4"
                >
                  {page.snapshot.title}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {profile && (profile.contact.email || profile.contact.links.length > 0) ? (
        <section aria-labelledby="contact">
          <SectionTitle id="contact">Kontakt</SectionTitle>
          <ul className="flex flex-wrap gap-3">
            {profile.contact.email ? (
              <li>
                <a
                  href={`mailto:${profile.contact.email}`}
                  className="inline-flex h-11 items-center border-2 border-accent bg-accent px-5 font-medium text-white hover:bg-accent-hover"
                >
                  {profile.contact.email}
                </a>
              </li>
            ) : null}
            {profile.contact.links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex h-11 items-center border-2 border-border-strong px-5 hover:bg-hover-surface"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
