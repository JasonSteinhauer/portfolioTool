import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listProjects, PROJECT_STATUS_LABEL } from "@/modules/projects/service";
import { Badge, Card, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Projekte" };

const dateFormat = new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric", timeZone: "Europe/Berlin" });
const fmt = (d: string | null) => (d ? dateFormat.format(new Date(`${d}T12:00:00Z`)) : null);

export default async function ProjectsPage() {
  const { actor } = await requireOwner();
  const projects = await listProjects(getDb(), actor);

  return (
    <>
      <PageHeader
        title="Projekte"
        meta={<Meta>Struktur</Meta>}
        actions={
          <>
            <Link
              href="/app/projects/map"
              className="inline-flex h-10 items-center border-2 border-border-strong px-4 text-sm hover:bg-hover-surface"
            >
              Karte ansehen
            </Link>
            <Link
              href="/app/projects/new"
              className="inline-flex h-10 items-center border-2 border-accent bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Neues Projekt
            </Link>
          </>
        }
      />
      {projects.length === 0 ? (
        <div className="border-2 border-dashed border-border-default px-6 py-12 text-center">
          <p className="text-text-secondary">
            Noch keine Projekte. Projekte bündeln zusammengehörige Reports – z. B. ein Praxisprojekt mit Lern-,
            Tätigkeits- und Projektberichten.
          </p>
          <Link
            href="/app/projects/new"
            className="mt-4 inline-block text-text-primary underline decoration-accent underline-offset-4"
          >
            Erstes Projekt anlegen
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
          {projects.map((p) => {
            const range = [fmt(p.startedOn), fmt(p.endedOn)].filter(Boolean).join(" – ");
            return (
              <li key={p.id}>
                <Card interactive className="h-full">
                  <Link href={`/app/projects/${p.id}`} className="flex h-full flex-col gap-3 p-5">
                    <span className="flex items-center justify-between gap-2">
                      <Badge tone={p.status === "active" ? "accent" : "default"}>
                        {PROJECT_STATUS_LABEL[p.status]}
                      </Badge>
                      <Meta>
                        {p.reportCount} {p.reportCount === 1 ? "Report" : "Reports"}
                      </Meta>
                    </span>
                    <span className="text-lg font-semibold leading-snug">{p.title}</span>
                    {p.summary ? <span className="line-clamp-3 text-sm text-text-secondary">{p.summary}</span> : null}
                    {range ? <Meta className="mt-auto">{range}</Meta> : null}
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
