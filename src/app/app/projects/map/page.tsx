import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getMapData } from "@/modules/links/service";
import { listProjects, toProjectTree } from "@/modules/projects/service";
import { Meta } from "@/ui/card";
import { layoutMap, type LayoutNode } from "@/ui/map/layout";
import { MapLegend, ReportMap } from "@/ui/map/report-map";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Karte der Reports" };

const control =
  "h-10 border-2 border-border-default bg-bg px-3 text-sm hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requireOwner();
  const raw = await searchParams;
  const projectId = typeof raw.project === "string" && raw.project ? raw.project : undefined;
  const selectedId = typeof raw.selected === "string" ? raw.selected : undefined;
  const db = getDb();
  const [data, projects] = await Promise.all([
    getMapData(db, actor, { projectId }),
    listProjects(db, actor).then(toProjectTree),
  ]);
  const layout = layoutMap(data);

  const query = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (projectId) p.set("project", projectId);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/projects/map${s ? `?${s}` : ""}`;
  };
  const hrefFor = (n: LayoutNode) =>
    n.virtual ? query({}) : n.id === selectedId ? query({}) : query({ selected: n.id });

  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));
  const selected = selectedId ? nodeById.get(selectedId) : undefined;
  const above = selected
    ? layout.edges.filter((e) => e.target === selected.id).map((e) => nodeById.get(e.source)!)
    : [];
  const below = selected
    ? layout.edges.filter((e) => e.source === selected.id).map((e) => nodeById.get(e.target)!)
    : [];
  const nodeHref = (n: LayoutNode) =>
    n.virtual ? null : n.kind === "project" ? `/app/projects/${n.id}` : `/app/reports/${n.id}`;

  return (
    <>
      <PageHeader
        title="Karte der Reports"
        meta={
          <Meta>
            <Link href="/app/projects" className="hover:text-text-primary">
              Projekte
            </Link>{" "}
            / Karte
          </Meta>
        }
        actions={
          <form className="flex flex-wrap items-end gap-2" action="/app/projects/map">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Projekt
              <select name="project" defaultValue={projectId ?? ""} className={control}>
                <option value="">Alle Projekte</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {"— ".repeat(p.depth - 1)}
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="h-10 border-2 border-border-strong px-4 text-sm hover:bg-hover-surface">
              Anzeigen
            </button>
          </form>
        }
      />

      {data.reports.length === 0 && data.projects.length === 0 ? (
        <div className="border-2 border-dashed border-border-default px-6 py-12 text-center text-text-secondary">
          Noch nichts zu zeigen. Lege Projekte an und verknüpfe Reports – dann entsteht hier die Karte.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-3">
            <ReportMap layout={layout} selectedId={selected?.id} hrefFor={hrefFor} />
            <MapLegend />
            <details className="text-sm">
              <summary className="cursor-pointer text-text-secondary">Als Liste anzeigen</summary>
              <ul className="mt-3 flex flex-col gap-1" data-testid="map-text-list">
                {layout.edges.map((e) => (
                  <li key={`${e.source}-${e.target}`}>
                    {nodeById.get(e.target)!.title}{" "}
                    <span className="text-text-secondary">{e.kind === "link" ? "baut auf" : "gehört zu"}</span>{" "}
                    {nodeById.get(e.source)!.title}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <aside
            aria-label="Auswahl"
            className="flex flex-col gap-4 self-start border-2 border-border-default bg-surface p-5"
            data-testid="map-panel"
          >
            {selected ? (
              <>
                <div>
                  <Meta>{selected.label}</Meta>
                  <h2 className="mt-1 text-lg font-semibold leading-snug">{selected.title}</h2>
                </div>
                {selected.kind === "report" ? (
                  <>
                    <NodeList title="Baut auf" nodes={above} empty="– oberste Ebene –" href={nodeHref} />
                    <NodeList title="Führt zu" nodes={below} empty="– nichts darunter –" href={nodeHref} />
                  </>
                ) : (
                  <NodeList title="Direkt darunter" nodes={below} empty="– keine Reports –" href={nodeHref} />
                )}
                {nodeHref(selected) ? (
                  <Link
                    href={nodeHref(selected)!}
                    className="inline-flex h-10 items-center justify-center border-2 border-accent bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
                  >
                    {selected.kind === "report" ? "Report öffnen" : "Projekt öffnen"}
                  </Link>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-text-secondary">
                Wähle einen Knoten, um zu sehen, worauf er aufbaut und wozu er führt. Verknüpfungen legst du im
                jeweiligen Report an.
              </p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function NodeList({
  title,
  nodes,
  empty,
  href,
}: {
  title: string;
  nodes: LayoutNode[];
  empty: string;
  href: (n: LayoutNode) => string | null;
}) {
  return (
    <div>
      <Meta>{title}</Meta>
      {nodes.length === 0 ? (
        <p className="mt-1 text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {nodes.map((n) => {
            const h = href(n);
            return (
              <li key={n.id}>
                {h ? (
                  <Link href={h} className="underline decoration-accent underline-offset-4">
                    {n.title}
                  </Link>
                ) : (
                  n.title
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
