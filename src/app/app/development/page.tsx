import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getTimeline, listCompetencies, listSubjectAreas } from "@/modules/development/service";
import { Button } from "@/ui/button";
import { Badge, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { deleteCompetencyAction, deleteSubjectAreaAction } from "./actions";
import { CompetencyForm, SubjectAreaForm } from "./dev-forms";

export const metadata: Metadata = { title: "Entwicklung" };

const monthFormat = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const asDate = (d: string) => new Date(`${d}T12:00:00Z`);

export default async function DevelopmentPage() {
  const { actor } = await requireOwner();
  const db = getDb();
  const [areas, competencies, timeline] = await Promise.all([
    listSubjectAreas(db, actor),
    listCompetencies(db, actor),
    getTimeline(db, actor),
  ]);

  const groups = [
    ...areas.map((a) => ({ id: a.id, name: a.name, items: competencies.filter((c) => c.subjectAreaId === a.id) })),
    { id: "", name: "Ohne Fachgebiet", items: competencies.filter((c) => !c.subjectAreaId) },
  ].filter((g) => g.id !== "" || g.items.length > 0);

  const months: { key: string; label: string; entries: typeof timeline }[] = [];
  for (const entry of timeline) {
    const key = entry.date.slice(0, 7);
    let month = months.at(-1);
    if (!month || month.key !== key) {
      month = { key, label: monthFormat.format(asDate(entry.date)), entries: [] };
      months.push(month);
    }
    month.entries.push(entry);
  }

  return (
    <>
      <PageHeader title="Entwicklung" meta={<Meta>Kompetenzen &amp; Timeline</Meta>} />
      <p className="mb-8 max-w-3xl text-sm text-text-secondary">
        Entwicklung zeigt sich an dokumentierter Arbeit, nicht an Prozentwerten: Jede Kompetenz wird durch Reports
        belegt. Zuordnen kannst du Kompetenzen direkt im jeweiligen Report.
      </p>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="timeline-heading">
          <h2 id="timeline-heading" className="mb-4 text-lg font-semibold">
            Timeline
          </h2>
          {months.length === 0 ? (
            <p className="border-2 border-dashed border-border-default px-4 py-6 text-sm text-text-secondary">
              Noch keine Einträge. Reports und Projekte erscheinen hier chronologisch.
            </p>
          ) : (
            <ol className="flex flex-col gap-8" data-testid="timeline">
              {months.map((m) => (
                <li key={m.key}>
                  <h3 className="mb-3 font-mono text-[12px] uppercase tracking-[0.08em] text-text-secondary">
                    {m.label}
                  </h3>
                  <ol className="flex flex-col gap-4 border-l-2 border-line-technical pl-6">
                    {m.entries.map((e) => (
                      <li key={`${e.kind}-${e.id}-${e.kind === "project" ? e.event : ""}`} className="relative">
                        <span
                          aria-hidden="true"
                          className={
                            e.kind === "project"
                              ? "absolute -left-[33px] top-1.5 size-3 border-2 border-accent bg-bg"
                              : e.status === "final"
                                ? "absolute -left-[32px] top-1.5 size-2.5 bg-accent"
                                : "absolute -left-[32px] top-1.5 size-2.5 border-2 border-border-strong bg-bg"
                          }
                        />
                        <Meta>{dayFormat.format(asDate(e.date))}</Meta>
                        {e.kind === "project" ? (
                          <p className="mt-0.5 text-sm">
                            Projekt{" "}
                            <Link
                              href={`/app/projects/${e.id}`}
                              className="font-medium underline decoration-accent underline-offset-4"
                            >
                              {e.title}
                            </Link>{" "}
                            {e.event === "start" ? "gestartet" : "abgeschlossen"}
                          </p>
                        ) : (
                          <div className="mt-0.5 flex flex-col gap-1">
                            <Link href={`/app/reports/${e.id}`} className="font-medium hover:underline">
                              {e.title}
                            </Link>
                            <span className="text-xs text-text-secondary">
                              {e.typeName}
                              {e.projectTitle ? ` · ${e.projectTitle}` : ""}
                              {e.status === "final" ? "" : " · Entwurf"}
                            </span>
                            {e.competencies.length > 0 ? (
                              <span className="flex flex-wrap gap-1">
                                {e.competencies.map((c) => (
                                  <Badge key={c}>{c}</Badge>
                                ))}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="competency-heading" className="flex flex-col gap-6">
          <h2 id="competency-heading" className="text-lg font-semibold">
            Kompetenzen
          </h2>
          {competencies.length === 0 && areas.length === 0 ? (
            <p className="border-2 border-dashed border-border-default px-4 py-6 text-sm text-text-secondary">
              Lege Fachgebiete und Kompetenzen an – dann siehst du hier, welche Reports sie belegen.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.id || "none"} className="flex flex-col gap-2" data-testid="competency-group">
                <div className="flex items-center justify-between gap-2 border-b border-line-technical pb-1">
                  <h3 className="font-mono text-[12px] uppercase tracking-[0.08em] text-accent-text">{g.name}</h3>
                  {g.id && g.items.length === 0 ? (
                    <form action={deleteSubjectAreaAction}>
                      <input type="hidden" name="subjectAreaId" value={g.id} />
                      <Button type="submit" variant="ghost" size="sm" aria-label={`Fachgebiet „${g.name}“ löschen`}>
                        Löschen
                      </Button>
                    </form>
                  ) : null}
                </div>
                {g.items.length === 0 ? <p className="text-xs text-text-secondary">Noch keine Kompetenzen.</p> : null}
                <ul className="flex flex-col divide-y divide-line-subtle">
                  {g.items.map((c) => (
                    <li key={c.id} className="py-2">
                      <details>
                        <summary className="flex cursor-pointer items-center justify-between gap-3">
                          <span className="font-medium">{c.name}</span>
                          <Meta>
                            {c.evidence.length === 0
                              ? "noch kein Beleg"
                              : `${c.evidence.length} ${c.evidence.length === 1 ? "Beleg" : "Belege"}`}
                          </Meta>
                        </summary>
                        <div className="mt-2 flex flex-col gap-2 pl-2">
                          {c.evidence.length > 0 ? (
                            <ul className="flex flex-col gap-1 text-sm">
                              {c.evidence.map((e) => (
                                <li key={e.reportId}>
                                  <Link
                                    href={`/app/reports/${e.reportId}`}
                                    className="underline decoration-accent underline-offset-4"
                                  >
                                    {e.title}
                                  </Link>{" "}
                                  <span className="text-xs text-text-secondary">
                                    {e.typeName} · {dayFormat.format(asDate(e.date))}
                                    {e.note ? ` – ${e.note}` : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <form action={deleteCompetencyAction}>
                            <input type="hidden" name="competencyId" value={c.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Kompetenz löschen
                            </Button>
                          </form>
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          <div className="grid gap-6 border-2 border-border-default bg-surface p-5 sm:grid-cols-2">
            <CompetencyForm areas={areas} />
            <SubjectAreaForm />
          </div>
        </section>
      </div>
    </>
  );
}
