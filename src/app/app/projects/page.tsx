import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listProjects, MAX_PROJECT_DEPTH, PROJECT_STATUS_LABEL, toProjectTree } from "@/modules/projects/service";
import { cn } from "@/ui/cn";
import { moveProjectAction } from "./actions";
import { Badge, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Projekte" };

const dateFormat = new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric", timeZone: "Europe/Berlin" });
const fmt = (d: string | null) => (d ? dateFormat.format(new Date(`${d}T12:00:00Z`)) : null);

export default async function ProjectsPage() {
  const { actor } = await requireOwner();
  const projects = toProjectTree(await listProjects(getDb(), actor));

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
        <ul className="flex flex-col border-y border-line-subtle" data-testid="project-list">
          {projects.map((p, i) => {
            const range = [fmt(p.startedOn), fmt(p.endedOn)].filter(Boolean).join(" – ");
            const siblings = projects.filter((x) => x.parentProjectId === p.parentProjectId);
            const pos = siblings.findIndex((x) => x.id === p.id);
            return (
              <li
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 border-line-subtle py-3 pr-2",
                  i > 0 && "border-t",
                  p.depth === 1 ? "pl-2" : p.depth === 2 ? "pl-8" : "pl-14",
                )}
                data-depth={p.depth}
              >
                <Link href={`/app/projects/${p.id}`} className="group flex min-w-0 flex-1 items-start gap-3">
                  {p.depth > 1 ? (
                    <span aria-hidden="true" className="mt-0.5 font-mono text-text-secondary">
                      └
                    </span>
                  ) : null}
                  <span className="flex min-w-0 flex-col gap-1">
                    <span
                      className={cn("truncate group-hover:underline", p.depth === 1 ? "font-semibold" : "font-medium")}
                    >
                      {p.title}
                    </span>
                    <Meta>
                      {PROJECT_STATUS_LABEL[p.status]} · {p.reportCount} {p.reportCount === 1 ? "Report" : "Reports"}
                      {p.childCount > 0
                        ? ` · ${p.childCount} ${p.childCount === 1 ? "Unterprojekt" : "Unterprojekte"} · ${p.totalReports} gesamt`
                        : ""}
                      {range ? ` · ${range}` : ""}
                    </Meta>
                  </span>
                </Link>
                <div className="flex items-center gap-1">
                  {p.status === "active" ? <Badge tone="accent">Aktiv</Badge> : null}
                  {p.depth < MAX_PROJECT_DEPTH ? (
                    <Link
                      href={`/app/projects/new?parent=${p.id}`}
                      className="inline-flex h-8 items-center px-2 text-[13px] text-text-secondary hover:bg-hover-surface hover:text-text-primary"
                      aria-label={`+ Unterprojekt in „${p.title}“`}
                    >
                      + Unterprojekt
                    </Link>
                  ) : null}
                  {(["up", "down"] as const).map((dir) => (
                    <form key={dir} action={moveProjectAction}>
                      <input type="hidden" name="projectId" value={p.id} />
                      <input type="hidden" name="dir" value={dir} />
                      <button
                        type="submit"
                        disabled={dir === "up" ? pos === 0 : pos === siblings.length - 1}
                        aria-label={`„${p.title}“ nach ${dir === "up" ? "oben" : "unten"}`}
                        title={dir === "up" ? "Nach oben" : "Nach unten"}
                        className="flex size-8 items-center justify-center text-sm text-text-secondary hover:bg-hover-surface hover:text-text-primary disabled:opacity-30"
                      >
                        {dir === "up" ? "↑" : "↓"}
                      </button>
                    </form>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
