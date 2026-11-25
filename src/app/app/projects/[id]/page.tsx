import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getMapData } from "@/modules/links/service";
import {
  getProject,
  listProjectReports,
  listUnassignedReports,
  PROJECT_STATUS_LABEL,
  ProjectNotFoundError,
} from "@/modules/projects/service";
import { Button } from "@/ui/button";
import { Badge, Meta } from "@/ui/card";
import { layoutMap } from "@/ui/map/layout";
import { MapLegend, ReportMap } from "@/ui/map/report-map";
import { PageHeader } from "@/ui/workspace-shell";
import { assignReportAction, deleteProjectAction } from "../actions";

export const metadata: Metadata = { title: "Projekt" };

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });
const fmt = (d: string | null) => (d ? dateFormat.format(new Date(`${d}T12:00:00Z`)) : "offen");
const select =
  "h-10 min-w-0 flex-1 border-2 border-border-default bg-bg px-3 text-sm hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  const project = await getProject(db, actor, id).catch((error: unknown) => {
    if (error instanceof ProjectNotFoundError) notFound();
    throw error;
  });
  const [reports, unassigned, mapData] = await Promise.all([
    listProjectReports(db, actor, project.id),
    listUnassignedReports(db, actor),
    getMapData(db, actor, { projectId: project.id }),
  ]);
  const layout = layoutMap(mapData);
  const self = `/app/projects/${project.id}`;

  return (
    <article>
      <PageHeader
        title={project.title}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={project.status === "active" ? "accent" : "default"}>
              {PROJECT_STATUS_LABEL[project.status]}
            </Badge>
            <Meta>
              {fmt(project.startedOn)} – {fmt(project.endedOn)}
            </Meta>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/app/projects/map?project=${project.id}`}
              className="inline-flex h-8 items-center border-2 border-border-strong px-3 text-[13px] hover:bg-hover-surface"
            >
              Große Karte
            </Link>
            <Link
              href={`${self}/edit`}
              className="inline-flex h-8 items-center border-2 border-accent bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
            >
              Bearbeiten
            </Link>
          </div>
        }
      />

      {project.summary ? <p className="mb-8 max-w-3xl leading-relaxed text-text-secondary">{project.summary}</p> : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="reports-heading">
            <h2 id="reports-heading" className="mb-3 text-lg font-semibold">
              Reports im Projekt
            </h2>
            {reports.length === 0 ? (
              <p className="border-2 border-dashed border-border-default px-4 py-6 text-sm text-text-secondary">
                Noch keine Reports. Füge rechts einen bestehenden Report hinzu oder ordne ihn im Report selbst zu.
              </p>
            ) : (
              <ul className="divide-y divide-line-subtle border-y border-line-subtle" data-testid="project-reports">
                {reports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
                    <Link href={`/app/reports/${r.id}`} className="flex min-w-0 flex-col gap-1 hover:underline">
                      <span className="truncate font-medium">{r.title}</span>
                      <Meta>
                        {r.typeName}
                        {r.occurredOn ? ` · ${fmt(r.occurredOn)}` : ""}
                      </Meta>
                    </Link>
                    <form action={assignReportAction}>
                      <input type="hidden" name="reportId" value={r.id} />
                      <input type="hidden" name="projectId" value="" />
                      <input type="hidden" name="returnTo" value={self} />
                      <Button type="submit" variant="ghost" size="sm" aria-label={`„${r.title}“ aus dem Projekt lösen`}>
                        Lösen
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="map-heading" className="flex flex-col gap-3">
            <h2 id="map-heading" className="text-lg font-semibold">
              Karte
            </h2>
            {mapData.reports.length === 0 ? (
              <p className="text-sm text-text-secondary">Die Karte erscheint, sobald das Projekt Reports enthält.</p>
            ) : (
              <>
                <ReportMap layout={layout} hrefFor={(n) => (n.kind === "report" ? `/app/reports/${n.id}` : self)} />
                <MapLegend />
              </>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section
            aria-labelledby="add-heading"
            className="flex flex-col gap-3 border-2 border-border-default bg-surface p-5"
          >
            <h2 id="add-heading" className="text-sm font-semibold">
              Report hinzufügen
            </h2>
            {unassigned.length === 0 ? (
              <p className="text-xs text-text-secondary">Alle Reports gehören bereits zu einem Projekt.</p>
            ) : (
              <form action={assignReportAction} className="flex flex-col gap-2">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="returnTo" value={self} />
                <label htmlFor="add-report" className="text-xs text-text-secondary">
                  Reports ohne Projekt
                </label>
                <div className="flex gap-2">
                  <select id="add-report" name="reportId" required className={select}>
                    {unassigned.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="md">
                    Hinzufügen
                  </Button>
                </div>
              </form>
            )}
          </section>
          <details className="border-2 border-border-default p-4">
            <summary className="cursor-pointer text-sm text-text-secondary">Projekt löschen …</summary>
            <form action={deleteProjectAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="projectId" value={project.id} />
              <p className="text-xs text-text-secondary">
                Die Reports bleiben erhalten und sind danach keinem Projekt zugeordnet.
              </p>
              <Button type="submit" variant="danger" size="sm">
                Endgültig löschen
              </Button>
            </form>
          </details>
        </aside>
      </div>
    </article>
  );
}
