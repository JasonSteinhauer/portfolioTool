import Link from "next/link";
import type { ProfileConfig } from "@/content/page-components/schema";
import { cn } from "@/ui/cn";
import { SectionLabel } from "./shell";

/** Eine Arbeit auf der Startseite (aus einem freigegebenen Snapshot oder einem Entwurf). */
export type ViewerWork = {
  id: string;
  href: string;
  title: string;
  eyebrow: string;
  summary: string;
  tags: string[];
  date: Date;
  /** „Fallstudie“ oder „Bericht“. */
  kindLabel: string;
};

const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const DELAYS = ["pv-d5", "pv-d6", "pv-d7", "pv-d8"];

export function homeNav(profile: ProfileConfig | null, works: ViewerWork[]) {
  return [
    ...(works.length > 0 ? [{ href: "#arbeiten", label: "./arbeiten" }] : []),
    ...(profile && profile.expertise.length > 0 ? [{ href: "#expertise", label: "./expertise" }] : []),
    ...(works.length > 1 ? [{ href: "#weg", label: "./weg" }] : []),
    ...(profile && (profile.contact.email || profile.contact.links.length > 0)
      ? [{ href: "#kontakt", label: "./kontakt" }]
      : []),
  ];
}

/** One-Pager im Stil „Terminal“: Hero, ausgewählte Arbeiten, Expertise, Weg, Kontakt. */
export function ViewerHome({ profile, works }: { profile: ProfileConfig | null; works: ViewerWork[] }) {
  const timeline = [...works].sort((a, b) => b.date.getTime() - a.date.getTime());
  const hasContact = Boolean(profile && (profile.contact.email || profile.contact.links.length > 0));
  let section = 0;

  return (
    <>
      <section className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-6 pb-20 pt-20 sm:px-8 sm:pt-28">
        <div className="min-w-0 flex-[1_1_520px]">
          <p className="pv-in m-0 font-mono text-[15px] text-[#ff5cae]">
            $ <span className="pv-typed">whoami</span>
            <span aria-hidden="true" className="pv-cursor">
              ▍
            </span>
          </p>
          <h1 className="pv-in pv-d1 mt-5 text-[clamp(2.4rem,5.2vw,4.25rem)] font-bold leading-[1.04] tracking-[-0.03em]">
            {profile?.name ?? "Portfolio"}
          </h1>
          {profile?.role ? <p className="pv-in pv-d2 mt-4 font-mono text-base text-[#7ee0b5]">{profile.role}</p> : null}
          {profile?.about ? (
            <p className="pv-in pv-d3 mt-6 max-w-xl whitespace-pre-line text-lg leading-relaxed text-[#9aa3ad]">
              {profile.about}
            </p>
          ) : null}
          <div className="pv-in pv-d3 mt-10 flex flex-wrap gap-3">
            {works.length > 0 ? (
              <a
                href="#arbeiten"
                className="rounded-[6px] border border-[#ff4fa3] px-6 py-3.5 font-mono text-sm text-[#ff5cae] transition-colors hover:bg-[#ff4fa3] hover:text-[#0a0c0f]"
              >
                → Arbeiten ansehen
              </a>
            ) : null}
            {hasContact ? (
              <a
                href="#kontakt"
                className="rounded-[6px] border border-[#2a313a] px-6 py-3.5 font-mono text-sm text-[#e6e8eb] transition-colors hover:border-[#9aa3ad]"
              >
                Kontakt
              </a>
            ) : null}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pv-in pv-d4 relative min-w-0 flex-[1_1_380px] overflow-hidden rounded-xl border border-[#1c2128] bg-[#0e1217] font-mono text-sm leading-[1.9]"
        >
          <div className="pv-scan pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-transparent via-[#ff4fa3]/[0.06] to-transparent" />
          <div className="flex gap-2 border-b border-[#1c2128] px-4 py-3.5">
            <span className="size-[11px] rounded-full bg-[#2a313a]" />
            <span className="size-[11px] rounded-full bg-[#2a313a]" />
            <span className="size-[11px] rounded-full bg-[#2a313a]" />
          </div>
          <div className="px-5 py-5">
            <div className="pv-in pv-d4">
              <span className="text-[#ff5cae]">❯</span> portfolio --favoriten
            </div>
            {works.slice(0, 4).map((w, i) => (
              <div key={w.id} className={cn("pv-in truncate text-[#9aa3ad]", DELAYS[i])}>
                {"  ✓ "}
                {w.title}
              </div>
            ))}
            {works.length === 0 ? <div className="pv-in pv-d5 text-[#9aa3ad]">{"  – noch leer –"}</div> : null}
            {profile && profile.expertise.length > 0 ? (
              <>
                <div className="pv-in pv-d7">
                  <span className="text-[#ff5cae]">❯</span> fokus
                </div>
                <div className="pv-in pv-d8 truncate text-[#7ee0b5]">
                  {"  "}
                  {profile.expertise
                    .slice(0, 3)
                    .map((e) => e.area)
                    .join(" · ")}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {works.length > 0 ? (
        <section id="arbeiten" aria-labelledby="arbeiten-h" className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
          <SectionLabel index={++section}>Ausgewählte Arbeiten</SectionLabel>
          <h2 id="arbeiten-h" className="pv-rv mb-12 mt-3 text-[2.6rem] font-bold tracking-[-0.02em]">
            Was ich gebaut habe
          </h2>
          <ul
            className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]"
            data-testid="viewer-work"
          >
            {works.map((w, i) => (
              <li key={w.id} className="pv-rv">
                <Link
                  href={w.href}
                  className="pv-card flex h-full min-h-[280px] flex-col gap-4 rounded-xl border border-[#1c2128] bg-[#0e1217] p-7 text-[#e6e8eb]"
                >
                  <span className="flex justify-between font-mono text-[13px] text-[#9aa3ad]">
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <span>{w.eyebrow || w.kindLabel}</span>
                  </span>
                  <span className="text-2xl font-bold leading-tight tracking-[-0.01em]">{w.title}</span>
                  {w.summary ? (
                    <span className="line-clamp-4 flex-1 leading-relaxed text-[#9aa3ad]">{w.summary}</span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  {w.tags.length > 0 ? (
                    <span className="font-mono text-xs text-[#7ee0b5]">{w.tags.slice(0, 5).join(" · ")}</span>
                  ) : null}
                  <span aria-hidden="true" className="font-mono text-sm text-[#ff5cae]">
                    {w.kindLabel} lesen →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
          <p className="font-mono text-[#9aa3ad]">Noch keine Arbeiten freigegeben.</p>
        </section>
      )}

      {profile && profile.expertise.length > 0 ? (
        <section id="expertise" aria-labelledby="expertise-h" className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
          <SectionLabel index={++section}>Expertise</SectionLabel>
          <h2 id="expertise-h" className="pv-rv mb-12 mt-3 text-[2.6rem] font-bold tracking-[-0.02em]">
            Womit ich arbeite
          </h2>
          <dl className="grid gap-px overflow-hidden rounded-xl border border-[#1c2128] bg-[#1c2128] [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
            {profile.expertise.map((e) => (
              <div key={e.area} className="pv-rv bg-[#0e1217] p-8">
                <dt className="text-xl font-semibold">{e.area}</dt>
                {e.detail ? (
                  <dd className="mt-3 whitespace-pre-line font-mono text-sm leading-loose text-[#9aa3ad]">
                    {e.detail}
                  </dd>
                ) : null}
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {timeline.length > 1 ? (
        <section id="weg" aria-labelledby="weg-h" className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
          <SectionLabel index={++section}>Weg</SectionLabel>
          <h2 id="weg-h" className="pv-rv mb-12 mt-3 text-[2.6rem] font-bold tracking-[-0.02em]">
            Entwicklung
          </h2>
          <ol className="flex flex-col gap-10 border-l border-[#2a313a] pl-7">
            {timeline.map((w, i) => (
              <li key={w.id} className="pv-rv relative">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -left-[35px] top-1.5 size-[13px] rounded-full",
                    i === 0 ? "bg-[#ff4fa3] shadow-[0_0_0_5px_rgba(255,79,163,0.18)]" : "bg-[#2a313a]",
                  )}
                />
                <p className="m-0 font-mono text-[13px] text-[#9aa3ad]">
                  {monthFormat.format(w.date).replace(".", " / ")}
                </p>
                <h3 className="mb-1 mt-1.5 text-[1.35rem] font-semibold">
                  <Link href={w.href} className="hover:text-[#ff5cae]">
                    {w.title}
                  </Link>
                </h3>
                {w.summary ? <p className="m-0 line-clamp-2 leading-relaxed text-[#9aa3ad]">{w.summary}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {profile && hasContact ? (
        <section id="kontakt" aria-labelledby="kontakt-h" className="mx-auto max-w-6xl px-6 pb-10 pt-24 sm:px-8">
          <div className="pv-rv flex flex-wrap items-center justify-between gap-8 rounded-2xl border border-[#1c2128] bg-[#0e1217] px-8 py-14 sm:px-12">
            <div>
              <p className="m-0 font-mono text-sm text-[#ff5cae]">
                {"// "}
                {String(++section).padStart(2, "0")} — kontakt
              </p>
              <h2 id="kontakt-h" className="mt-3 text-[2.8rem] font-bold tracking-[-0.02em]">
                Lass uns sprechen.
              </h2>
            </div>
            <ul className="flex flex-wrap gap-3">
              {profile.contact.email ? (
                <li>
                  <a
                    href={`mailto:${profile.contact.email}`}
                    className="inline-block rounded-[8px] border border-[#ff4fa3] px-6 py-4 font-mono text-[#ff5cae] transition-colors hover:bg-[#ff4fa3] hover:text-[#0a0c0f]"
                  >
                    {profile.contact.email} →
                  </a>
                </li>
              ) : null}
              {profile.contact.links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-block rounded-[8px] border border-[#2a313a] px-6 py-4 font-mono text-[#e6e8eb] transition-colors hover:border-[#9aa3ad]"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
