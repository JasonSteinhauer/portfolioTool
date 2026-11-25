import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { viewerMediaUrl } from "@/content/page-components/render";
import { getDb } from "@/lib/db/client";
import { getViewerHome } from "@/modules/sharing/service";
import { getViewerLink } from "@/modules/sharing/viewer";
import { ViewerDocument } from "@/ui/viewer/document";
import { resolveRelated } from "@/ui/viewer/map";
import { brandFromName, ViewerShell } from "@/ui/viewer/shell";

export const metadata: Metadata = { title: "Bericht" };

/** Eine freigegebene Seite – nur, wenn der Link sie umfasst und sie aktuell freigegeben ist. */
export default async function ViewerPage({ params }: { params: Promise<{ slug: string }> }) {
  const link = await getViewerLink();
  if (!link) notFound();
  const { slug } = await params;
  const { profile, pages } = await getViewerHome(getDb(), link);
  const page = pages.find((p) => p.slug === slug);
  if (!page) notFound();

  // Verknüpfte Berichte sind nur klickbar, wenn auch sie über DIESEN Link freigegeben sind.
  const visible = new Map(pages.map((p) => [p.pageId, `/p/${p.slug}`]));
  const related = resolveRelated(page.snapshot.related, (id) =>
    id === page.pageId ? null : (visible.get(id) ?? null),
  );
  const single = link.scopeType === "page";

  return (
    <ViewerShell brand={brandFromName(profile?.name)} homeHref={single ? `/p/${slug}` : "/p"} progress>
      <div lang={page.snapshot.locale}>
        <ViewerDocument
          config={page.snapshot.page}
          mediaUrl={viewerMediaUrl}
          related={related}
          homeHref={single ? undefined : "/p"}
        />
      </div>
    </ViewerShell>
  );
}
