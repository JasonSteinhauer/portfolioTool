import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getPage, listFavoriteIds, PageNotFoundError } from "@/modules/portfolio/service";
import { Button } from "@/ui/button";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { toggleFavoriteAction, unpublishPageAction } from "../actions";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Portfolio-Seite" };

export default async function PortfolioPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  const page = await getPage(db, actor, id).catch((error: unknown) => {
    if (error instanceof PageNotFoundError) notFound();
    throw error;
  });
  const favorite = (await listFavoriteIds(db, actor, "page")).has(page.id);

  return (
    <>
      <PageHeader
        title={page.title}
        meta={
          <Meta>
            <Link href="/app/portfolio" className="hover:text-text-primary">
              ← Portfolio
            </Link>
            {page.sourceReportId ? (
              <>
                {" · "}
                <Link href={`/app/reports/${page.sourceReportId}`} className="hover:text-text-primary">
                  Quell-Report
                </Link>
              </>
            ) : null}
          </Meta>
        }
        actions={
          <>
            <form action={toggleFavoriteAction}>
              <input type="hidden" name="itemType" value="page" />
              <input type="hidden" name="itemId" value={page.id} />
              <input type="hidden" name="returnTo" value={`/app/portfolio/${page.id}`} />
              <Button type="submit" variant="ghost" size="sm" aria-pressed={favorite}>
                {favorite ? "★ Favorit" : "☆ Als Favorit"}
              </Button>
            </form>
            {page.current ? (
              <form action={unpublishPageAction}>
                <input type="hidden" name="pageId" value={page.id} />
                <Button type="submit" variant="danger" size="sm">
                  Freigabe zurückziehen
                </Button>
              </form>
            ) : null}
          </>
        }
      />
      <PageEditor
        pageId={page.id}
        initialMeta={{ title: page.title, slug: page.slug, locale: page.locale }}
        initialConfig={page.config}
        publishedVersion={page.current?.versionNo ?? null}
      />
    </>
  );
}
