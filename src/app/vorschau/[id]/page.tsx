import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { workspaceMediaUrl } from "@/content/page-components/render";
import type { PageConfig } from "@/content/page-components/schema";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getPage, PageNotFoundError, previewRelated, type CaseStudySnapshot } from "@/modules/portfolio/service";
import { getViewerHome } from "@/modules/sharing/service";
import { ViewerDocument } from "@/ui/viewer/document";
import { resolveRelated } from "@/ui/viewer/map";
import { brandFromName, PreviewBanner, ViewerShell } from "@/ui/viewer/shell";

export const metadata: Metadata = { title: "Seite" };

/**
 * Eine Seite so, wie Empfänger sie sehen. Standard: der aktuelle ENTWURF (vor der Freigabe prüfen).
 * Mit `?stand=freigegeben`: der aktuell freigegebene Snapshot.
 */
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const published = (await searchParams).stand === "freigegeben";
  const db = getDb();
  const page = await getPage(db, actor, id).catch((error: unknown) => {
    if (error instanceof PageNotFoundError) notFound();
    throw error;
  });
  const home = await getViewerHome(db, { id: "vorschau", ownerId: actor.userId, scopeType: "showcase", scopeId: null });
  const visible = new Map(home.pages.map((p) => [p.pageId, `/vorschau/${p.pageId}?stand=freigegeben`]));

  let config: PageConfig;
  let related: CaseStudySnapshot["related"];
  let locale: "de" | "en";
  if (published) {
    if (!page.current) notFound();
    const snapshot = page.current.config as CaseStudySnapshot;
    config = snapshot.page;
    related = snapshot.related;
    locale = snapshot.locale;
  } else {
    config = page.config;
    related = await previewRelated(db, actor, page.id);
    locale = page.locale;
  }

  return (
    <ViewerShell
      brand={brandFromName(home.profile?.name)}
      homeHref="/vorschau"
      progress
      banner={
        <PreviewBanner backHref={`/app/portfolio/${page.id}`}>
          {published
            ? "Vorschau – so sehen Empfänger diese Seite aktuell (freigegebener Stand)."
            : page.current
              ? "Vorschau des Entwurfs – so sehen es Empfänger nach der nächsten Freigabe."
              : "Vorschau – noch nicht freigegeben. So sehen es Empfänger nach der Freigabe."}
        </PreviewBanner>
      }
    >
      <div lang={locale}>
        <ViewerDocument
          config={config}
          mediaUrl={published ? (mid) => `/api/media/published/${mid}` : workspaceMediaUrl}
          related={resolveRelated(related, (pid) => (pid === page.id ? null : (visible.get(pid) ?? null)))}
          homeHref="/vorschau"
          homeLabel="Zur Startseite (Vorschau)"
        />
      </div>
    </ViewerShell>
  );
}
